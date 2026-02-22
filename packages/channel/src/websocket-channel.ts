import type { ServerWebSocket } from "bun";
import type { Session } from "@fenced/session";
import {
  encodeServerEnvelope,
  parseClientEnvelope,
  type AssistantMessagePayload,
  type ClientToServerEnvelope,
  type DataPatchPayload,
  type InteractionId,
  type LogLine,
  type TracePayload,
  type MarkdownChunkPayload,
  type MessageId,
  type MountPayload,
  type SessionPayload,
  type ServerToClientEnvelope,
  type StreamedDataId,
  type UiSubmitPayload,
} from "@fenced/shared";

export type SocketContext = {
  session: Session;
  channel?: WebSocketChannel;
};

export type MarkdownStreamContext = {
  interactionId: InteractionId;
  messageId: MessageId;
};

export interface RuntimeChannel {
  sendSession(payload?: Partial<SessionPayload>): void;
  sendAssistantMessage(payload: AssistantMessagePayload): void;
  sendMarkdown(context: MarkdownStreamContext, stream: AsyncIterable<string>): Promise<void>;
  sendStreamedData(streamedDataId: StreamedDataId, stream: AsyncIterable<string>): Promise<void>;
  sendMount(event: MountPayload): Promise<unknown>;
  sendDataPatch(event: DataPatchPayload): void;
  sendTrace?(payload: TracePayload): void;
  log(line: LogLine): void;
  shutdown(reason?: unknown): void;
  notifyClosed(): void;
}

export type WebSocketChannelOptions = {
  schemaVersion?: number;
};

export class WebSocketChannel implements RuntimeChannel {
  private closed = false;
  private readonly pendingResults = new Map<string, (value: unknown) => void>();

  constructor(
    private readonly socket: ServerWebSocket<SocketContext>,
    private readonly session: Session,
    private readonly options: WebSocketChannelOptions = {},
  ) {
  }

  sendSession(payload: Partial<SessionPayload> = {}): void {
    const envelope: ServerToClientEnvelope = {
      type: "session",
      payload: {
        id: this.session.id,
        createdAt: this.session.createdAt.toISOString(),
        schemaVersion: payload.schemaVersion ?? this.options.schemaVersion,
        capabilities: payload.capabilities,
      },
    };
    this.send(envelope);
  }

  sendAssistantMessage(payload: AssistantMessagePayload): void {
    this.send({ type: "assistant_message", payload });
  }

  sendTrace(payload: TracePayload): void {
    if (!payload.text) return;
    this.send({ type: "trace", payload });
  }

  async sendMarkdown(context: MarkdownStreamContext, stream: AsyncIterable<string>): Promise<void> {
    for await (const chunk of stream) {
      if (!chunk) continue;
      const payload: MarkdownChunkPayload = {
        interactionId: context.interactionId,
        messageId: context.messageId,
        text: chunk,
      };
      this.send({ type: "markdown_chunk", payload });
    }
  }

  async sendStreamedData(streamedDataId: StreamedDataId, stream: AsyncIterable<string>): Promise<void> {
    this.send({ type: "streamed_data_reset", payload: { streamedDataId } });
    for await (const chunk of stream) {
      if (!chunk) continue;
      this.send({ type: "streamed_data_chunk", payload: { streamedDataId, chunk } });
    }
  }

  sendMount(event: MountPayload): Promise<unknown> {
    this.send({ type: "mount", payload: event });

    return new Promise<unknown>((resolve) => {
      this.pendingResults.set(event.mountId, resolve);
    });
  }

  sendDataPatch(event: DataPatchPayload): void {
    this.send({ type: "data_patch", payload: event });
  }

  log(line: LogLine): void {
    const payload: LogLine = {
      ...line,
      src: line.src ?? "server",
      t: line.t ?? new Date().toISOString(),
    };
    this.send({ type: "log_line", payload });
  }

  shutdown(reason?: unknown): void {
    if (this.closed) return;
    this.closed = true;
    if (reason) {
      console.debug("Closing channel", { reason });
    }
    try {
      this.socket.close();
    } catch (error) {
      console.warn("Failed to close websocket", error);
    }
  }

  notifyClosed(): void {
    this.closed = true;
  }

  private send(envelope: ServerToClientEnvelope): void {
    if (this.closed) return;
    try {
      this.socket.send(encodeServerEnvelope(envelope));
    } catch (error) {
      this.closed = true;
      console.error("Failed to send websocket frame", error);
    }
  }

  private handleIncoming(message: unknown): void {
    const parsed = parseClientEnvelope(message);
    if (!parsed.ok) {
      this.log({ lvl: "warn", code: "invalid_envelope", msg: parsed.error });
      return;
    }

    this.dispatchClientEnvelope(parsed.envelope);
  }

  private dispatchClientEnvelope(envelope: ClientToServerEnvelope): void {
    switch (envelope.type) {
      case "ui_submit":
        this.resolveUiSubmit(envelope.payload);
        return;
      case "client_log":
        this.log({ ...envelope.payload, src: "client" });
        return;
      default:
        return;
    }
  }

  resolveUiSubmit(payload: UiSubmitPayload): void {
    const resolver = this.pendingResults.get(payload.mountId);
    if (!resolver) {
      this.log({
        lvl: "error",
        code: "unknown_ui_submit",
        msg: "ui_submit received with no pending mount",
        data: { mountId: payload.mountId },
      });
      return;
    }

    this.pendingResults.delete(payload.mountId);
    resolver(payload.value);
  }
}
