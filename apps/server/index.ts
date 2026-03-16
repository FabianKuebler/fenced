import {
  API_PORT,
  parseClientEnvelope,
  type CallbackInvokePayload,
  type ClientToServerEnvelope,
  type RecordingActionDonePayload,
  type UiSubmitPayload,
  type UserMessagePayload
} from "@fenced/shared";
import { WebSocketChannel, type SocketContext } from "@fenced/channel";
import { Session } from "@fenced/session";
import { Runtime } from "@fenced/runtime";
import type { ServerWebSocket } from "bun";
import { parseArgs } from "util";
import { join } from "node:path";

const { values: cliArgs } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "play-recording": {
      type: "string",
      short: "p",
    },
  },
  strict: true,
  allowPositionals: false,
});

const recordingPath = cliArgs["play-recording"];

type ServerSocketContext = SocketContext & {
  runtime?: Runtime;
};

const PROTOCOL_SCHEMA_VERSION = 1;
const CHANNEL_CAPABILITIES = {
  markdown_stream: true,
  agent_data_stream: true,
  mounts: true,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const CLIENT_DIST = join(import.meta.dir, "../client/dist");
const hasClientDist = await Bun.file(join(CLIENT_DIST, "index.html")).exists();

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

await Runtime.loadSkills();

const server = Bun.serve<ServerSocketContext>({
  port: API_PORT,
  hostname: "0.0.0.0",
  fetch(request, server) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const { pathname } = new URL(request.url);

    if (pathname === "/chat") {
      console.debug("[ws] incoming upgrade", { url: request.url });
      const upgraded = server.upgrade(request, {
        data: {
          session: new Session(),
        },
      });

      if (upgraded) {
        return;
      }

      console.warn("[ws] upgrade failed", { url: request.url });
      return new Response("Upgrade failed", { status: 400, headers: corsHeaders });
    }

    if (hasClientDist) {
      return serveStatic(pathname);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
  websocket: {
    open(ws) {
      console.debug("[ws] open", { session: ws.data.session.id });
      const channel = new WebSocketChannel(ws, ws.data.session, {
        schemaVersion: PROTOCOL_SCHEMA_VERSION,
      });
      ws.data.channel = channel;
      ws.data.runtime = new Runtime(channel, { recordingPath });
      channel.sendSession({ capabilities: CHANNEL_CAPABILITIES });
      ws.data.runtime.init();
    },
    async message(ws, message) {
      const channel = ws.data.channel;
      if (!channel) {
        return;
      }
      const parsed = parseClientEnvelope(message);
      if (!parsed.ok) {
        channel.log({
          lvl: "warn",
          code: parsed.error,
          msg: "Dropping client frame",
          data: { raw: parsed.raw },
        });
        return;
      }
      await handleClientEnvelope(ws, channel, parsed.envelope);
    },
    close(ws) {
      console.debug("[ws] close", { session: ws.data.session.id });
      ws.data.channel?.notifyClosed();
      ws.data.runtime?.stop();
    },
  },
});

console.log(`🔌 API listening on ${server.url}`);
if (recordingPath) {
  console.log(`📼 Recording mode: will play ${recordingPath} on first interaction`);
}

async function serveStatic(pathname: string): Promise<Response> {
  const filePath = join(CLIENT_DIST, pathname);

  if (!filePath.startsWith(CLIENT_DIST)) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  const file = Bun.file(filePath);

  if (await file.exists()) {
    const ext = pathname.substring(pathname.lastIndexOf("."));
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    return new Response(file, { headers: { ...corsHeaders, "Content-Type": contentType } });
  }

  // SPA fallback: serve index.html for non-file routes
  const indexFile = Bun.file(join(CLIENT_DIST, "index.html"));
  return new Response(indexFile, { headers: { ...corsHeaders, "Content-Type": "text/html" } });
}

async function handleClientEnvelope(
  ws: ServerWebSocket<ServerSocketContext>,
  channel: WebSocketChannel,
  envelope: ClientToServerEnvelope,
) {
  try {
    switch (envelope.type) {
      case "user_message":
        await handleUserMessage(ws, channel, envelope.payload);
        return;
      case "ui_submit":
        handleUiSubmit(channel, envelope.payload);
        return;
      case "callback_invoke":
        handleCallbackInvoke(ws, envelope.payload);
        return;
      case "recording_action_done":
        handleRecordingActionDone(channel, envelope.payload);
        return;
      case "client_log":
        channel.log({
          lvl: envelope.payload.lvl,
          msg: envelope.payload.msg,
          data: envelope.payload.data,
          src: "client",
        });
        return;
    }
  } catch (error) {
    channel.log({
      lvl: "error",
      code: "handler_failed",
      msg: "Client envelope handler failed",
      data: { type: envelope.type, error: error instanceof Error ? error.message : String(error) },
    });
  }
}

async function handleUserMessage(
  ws: ServerWebSocket<ServerSocketContext>,
  channel: WebSocketChannel,
  payload: UserMessagePayload,
) {
  const runtime = ws.data.runtime;
  if (!runtime) {
    channel.log({
      lvl: "error",
      code: "runtime_missing",
      msg: "Runtime not available for user_message",
    });
    return;
  }

  await runtime.newInteraction(payload.text);
}

function handleUiSubmit(channel: WebSocketChannel, payload: UiSubmitPayload) {
  channel.resolveUiSubmit(payload);
  channel.log({
    lvl: "info",
    code: "ui_submit",
    msg: "Received UI submission",
    data: { mountId: payload.mountId },
  });
}

function handleRecordingActionDone(channel: WebSocketChannel, payload: RecordingActionDonePayload) {
  channel.resolveRecordingActionDone(payload);
}

function handleCallbackInvoke(
  ws: ServerWebSocket<ServerSocketContext>,
  payload: CallbackInvokePayload,
) {
  const runtime = ws.data.runtime;
  if (!runtime) {
    console.warn("[callback_invoke] No runtime available");
    return;
  }
  runtime.invokeCallback(payload);
}
