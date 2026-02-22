const decoder = new TextDecoder();

export type StreamedDataId = string;
export type InteractionId = string;
export type MessageId = string;
export type SessionId = string;

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogLine = {
  t?: string;
  lvl: LogLevel;
  msg?: string;
  data?: unknown;
  code?: string;
  runId?: string;
  blockIndex?: number;
  src?: "server" | "client";
};

// Mirrors Valtio INTERNAL_Op for streaming raw mutation ops.
export type DataPatch = readonly [op: "set" | "delete", path: Array<string | symbol>, value: unknown, prev: unknown];

// JSON Schema types for output binder generation (subset of JSON Schema Draft 7)
export type JsonSchema = {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object" | "null";
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: (string | number | boolean | null)[];
  const?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string; // e.g., "date-time", "email", "uri"
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  description?: string;
};

export type SessionPayload = {
  id: SessionId;
  createdAt: string;
  schemaVersion?: number;
  capabilities?: Record<string, unknown>;
};

export type AssistantBlock =
  | { kind: "agent_run"; index: number; source: string }
  | { kind: "agent_data"; index: number; streamedDataId: StreamedDataId; jsonSource: string };

export type AssistantMessagePayload = {
  interactionId: InteractionId;
  messageId: MessageId;
  markdown: string;
  blocks: AssistantBlock[];
};

export type MarkdownChunkPayload = {
  interactionId: InteractionId;
  messageId: MessageId;
  text: string;
};

export type StreamedDataResetPayload = {
  streamedDataId: StreamedDataId;
};

export type StreamedDataChunkPayload = {
  streamedDataId: StreamedDataId;
  chunk: string;
};

export type TraceCategory = "system" | "example_user" | "example_assistant" | "llm" | "user" | "exec_result" | "exec_error";

export type TracePayload = {
  interactionId: InteractionId;
  messageId: MessageId;
  text: string;
  category: TraceCategory;
};

export type MountPayload = {
  mountId: string;
  uiSource: string;
  initialData?: unknown;
  streamedDataId?: StreamedDataId;
  outputSchema: JsonSchema;
  callbackNames?: string[];
};

export type DataPatchPayload = {
  mountId: string;
  patches: DataPatch[];
};

export type ServerToClientEnvelope =
  | { type: "session"; payload: SessionPayload }
  | { type: "assistant_message"; payload: AssistantMessagePayload }
  | { type: "markdown_chunk"; payload: MarkdownChunkPayload }
  | { type: "streamed_data_reset"; payload: StreamedDataResetPayload }
  | { type: "streamed_data_chunk"; payload: StreamedDataChunkPayload }
  | { type: "mount"; payload: MountPayload }
  | { type: "data_patch"; payload: DataPatchPayload }
  | { type: "log_line"; payload: LogLine }
  | { type: "trace"; payload: TracePayload };

export type UserMessagePayload = {
  text: string;
  interactionId?: InteractionId;
};

export type UiSubmitPayload = {
  mountId: string;
  value: unknown;
};

export type ClientLogPayload = {
  lvl: LogLevel;
  msg?: string;
  data?: unknown;
};

export type CallbackInvokePayload = {
  mountId: string;
  name: string;
  args: unknown[];
};

export type ClientToServerEnvelope =
  | { type: "user_message"; payload: UserMessagePayload }
  | { type: "ui_submit"; payload: UiSubmitPayload }
  | { type: "client_log"; payload: ClientLogPayload }
  | { type: "callback_invoke"; payload: CallbackInvokePayload };

export type ParsedClientEnvelope =
  | { ok: true; raw: string; envelope: ClientToServerEnvelope }
  | { ok: false; raw?: string; error: string };

/**
 * Parse any websocket frame coming from the browser. Supports strings,
 * ArrayBuffers, typed arrays, and Buffers. Result indicates whether the
 * payload matched a known envelope shape.
 */
export function parseClientEnvelope(message: unknown): ParsedClientEnvelope {
  const normalized = normalizeIncomingFrame(message);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const raw = normalized.text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, raw, error: "invalid_json" };
  }

  if (!isRecord(parsed)) {
    return { ok: false, raw, error: "invalid_envelope" };
  }

  const type = typeof parsed.type === "string" ? parsed.type : undefined;
  if (!type) {
    return { ok: false, raw, error: "missing_type" };
  }

  const payload = parsed.payload;
  if (!isRecord(payload)) {
    return { ok: false, raw, error: "missing_payload" };
  }

  const envelope = mapClientPayload(type, payload);
  if (!envelope) {
    return { ok: false, raw, error: "unsupported_envelope" };
  }

  return { ok: true, raw, envelope };
}

export function encodeServerEnvelope(envelope: ServerToClientEnvelope): string {
  return JSON.stringify(envelope);
}

function normalizeIncomingFrame(
  message: unknown,
): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof message === "string") {
    return { ok: true, text: message };
  }

  if (isArrayBufferLike(message)) {
    return { ok: true, text: decoder.decode(new Uint8Array(message)) };
  }

  if (ArrayBuffer.isView(message)) {
    return { ok: true, text: decodeView(message) };
  }

  return { ok: false, error: "unsupported_message_type" };
}

function mapClientPayload(
  type: string,
  payload: Record<string, unknown>,
): ClientToServerEnvelope | undefined {
  switch (type) {
    case "user_message": {
      const text = asNonEmptyString(payload.text);
      if (!text) {
        return undefined;
      }
      const interactionId = asNonEmptyString(payload.interactionId);
      return interactionId
        ? { type: "user_message", payload: { interactionId, text } }
        : { type: "user_message", payload: { text } };
    }
    case "ui_submit": {
      const mountId = asNonEmptyString(payload.mountId);
      if (!mountId) {
        return undefined;
      }
      return { type: "ui_submit", payload: { mountId, value: payload.value } };
    }
    case "client_log": {
      const lvl = asLogLevel(payload.lvl);
      if (!lvl) {
        return undefined;
      }
      const entry: ClientLogPayload = { lvl };
      if ("msg" in payload && typeof payload.msg === "string") {
        entry.msg = payload.msg;
      }
      if ("data" in payload) {
        entry.data = payload.data;
      }
      return { type: "client_log", payload: entry };
    }
    case "callback_invoke": {
      const mountId = asNonEmptyString(payload.mountId);
      const name = asNonEmptyString(payload.name);
      if (!mountId || !name) {
        return undefined;
      }
      const args = Array.isArray(payload.args) ? payload.args : [];
      return { type: "callback_invoke", payload: { mountId, name, args } };
    }
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asLogLevel(value: unknown): LogLevel | undefined {
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  return undefined;
}

function isArrayBufferLike(value: unknown): value is ArrayBufferLike {
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
    return true;
  }
  if (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer) {
    return true;
  }
  return false;
}

function decodeView(view: ArrayBufferView): string {
  const uint8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return decoder.decode(uint8);
}
