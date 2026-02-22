import { useCallback, useEffect, useRef, useState } from "react";
import { ChatComposer } from "./ChatComposer";
import { ComponentRender } from "@fenced/component-render";
import { parse as parseJsonStream } from "jsonriver";
import {
  API_PORT,
  type DataPatch,
  type DataPatchPayload,
  type StreamedDataChunkPayload,
  type StreamedDataResetPayload,
  type TracePayload,
  type TraceCategory,
  type MarkdownChunkPayload,
  type MountPayload,
  type JsonSchema,
  type ServerToClientEnvelope,
  type SessionPayload,
} from "@fenced/shared";
import "./App.css";

type Role = "assistant" | "user";
type MessageStatus = "streaming" | "complete";
type ConnectionStatus = "connecting" | "open" | "closed" | "error";

type Message = {
  id: string;
  role: Role;
  content: string;
  status: MessageStatus;
  messageId?: string;
  seq: number;
};

type MountInstance = {
  mountId: string;
  streamedDataId?: string;
  uiSource: string;
  data: Record<string, unknown>;
  streamedData?: Record<string, unknown> | null;
  outputSchema: JsonSchema;
  callbackNames?: string[];
  seq: number;
};

type JsonStreamController = {
  push: (chunk: string) => void;
  close: () => void;
};

type TraceEntry = {
  id: string;
  text: string;
  category: TraceCategory;
};

const STREAM_IDLE_MS = 900;
const RECONNECT_DELAY_MS = 1200;

const createId = (prefix: string) =>
  `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10)}`;

const shortId = (value?: string) => (value ? value.slice(0, 8) : "—");

const resolveSocketCandidates = () => {
  const override = import.meta.env.VITE_WS_URL?.trim();
  if (override) return [override];

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const sameOrigin = `${protocol}://${window.location.host}/chat`;
  const apiPort = import.meta.env.VITE_API_PORT?.trim() || `${API_PORT}`;
  const apiHost = `${protocol}://${window.location.hostname || "localhost"}:${apiPort}/chat`;

  const uniq = new Set<string>();
  [sameOrigin, apiHost].forEach((url) => uniq.add(url));
  return [...uniq];
};

function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [session, setSession] = useState<SessionPayload | null>(null);
  const seqRef = useRef(0);
  const nextSeq = () => ++seqRef.current;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: createId("assistant"),
      role: "assistant",
      content: "What can I help you with today?",
      status: "complete",
      seq: 0,
    },
  ]);
  const [mounts, setMounts] = useState<MountInstance[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [traceEntries, setTraceEntries] = useState<TraceEntry[]>([]);
  const [tokensCopied, setTokensCopied] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const tokenLogRef = useRef<HTMLDivElement | null>(null);
  const tokenLogAutoScrollRef = useRef(true);
  const hasUserSentMessageRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const connectSocketRef = useRef<() => void>();
  const socketCandidatesRef = useRef<string[]>(resolveSocketCandidates());
  const currentCandidateRef = useRef(0);
  const strictReadyRef = useRef(import.meta.env.PROD);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const idleTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const messageIdleTimersRef = useRef<Map<string, number>>(new Map());
  const jsonStreamsRef = useRef<Map<string, JsonStreamController>>(new Map());

  const markStreamActivity = useCallback(() => {
    setIsStreaming(true);
    if (idleTimeoutRef.current !== null) {
      window.clearTimeout(idleTimeoutRef.current);
    }
    idleTimeoutRef.current = window.setTimeout(() => {
      setIsStreaming(false);
    }, STREAM_IDLE_MS);
  }, []);

  const handleTrace = useCallback((payload: TracePayload) => {
    if (!payload.text) return;
    setTraceEntries((prev) => [
      ...prev,
      { id: createId("trace"), text: payload.text, category: payload.category },
    ]);
    markStreamActivity();
  }, [markStreamActivity]);

  const scheduleMessageComplete = useCallback((messageId: string) => {
    const timers = messageIdleTimersRef.current;
    const existingTimer = timers.get(messageId);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timeoutId = window.setTimeout(() => {
      setMessages((prev) => {
        const next = [...prev];
        const index = next.findIndex((entry) => entry.messageId === messageId);
        if (index === -1) return prev;
        next[index] = { ...next[index], status: "complete" };
        return next;
      });
      timers.delete(messageId);
    }, STREAM_IDLE_MS);

    timers.set(messageId, timeoutId);
  }, []);

  const handleMarkdownChunk = useCallback((payload: MarkdownChunkPayload) => {
    const { messageId, text } = payload;
    if (!messageId || !text) {
      return;
    }

    setMessages((prev) => {
      const next = [...prev];
      const index = next.findIndex((entry) => entry.messageId === messageId);
      if (index === -1) {
        next.push({
          id: createId("assistant"),
          role: "assistant",
          content: text,
          status: "streaming",
          messageId,
          seq: nextSeq(),
        });
        return next;
      }

      const existing = next[index];
      next[index] = {
        ...existing,
        content: `${existing.content}${text}`,
        status: "streaming",
      };
      return next;
    });

    markStreamActivity();
    scheduleMessageComplete(messageId);
  }, [markStreamActivity, scheduleMessageComplete]);

  const handleMount = useCallback((payload: MountPayload) => {
    setMounts((prev) => {
      const normalizedData = isRecord(payload.initialData) ? payload.initialData : {};
      const existingIndex = prev.findIndex((entry) => entry.mountId === payload.mountId);

      const nextMount: MountInstance = {
        mountId: payload.mountId,
        streamedDataId: payload.streamedDataId,
        uiSource: payload.uiSource,
        data: normalizedData,
        streamedData: null,
        outputSchema: payload.outputSchema,
        callbackNames: payload.callbackNames,
        seq: existingIndex === -1 ? nextSeq() : prev[existingIndex].seq,
      };

      if (existingIndex === -1) {
        return [...prev, nextMount];
      }

      const copy = [...prev];
      copy[existingIndex] = nextMount;
      return copy;
    });
  }, []);

  const startStreamedDataStream = useCallback(
    (streamedDataId: string): JsonStreamController => {
      const existing = jsonStreamsRef.current.get(streamedDataId);
      existing?.close();

      const chunkStream = createChunkStream();
      const controller: JsonStreamController = {
        push: chunkStream.push,
        close: chunkStream.close,
      };
      jsonStreamsRef.current.set(streamedDataId, controller);

      (async () => {
        try {
          for await (const value of parseJsonStream(chunkStream.iterable)) {
            if (!mountedRef.current) return;
            if (!isRecord(value)) continue;
            const nextValue = cloneValue(value);
            setMounts((prev) =>
              prev.map((mount) =>
                matchesStreamedData(mount, streamedDataId) ? { ...mount, streamedData: nextValue } : mount,
              ),
            );
          }
        } catch (error) {
          console.warn("[streamed_data] parse failed", error);
        }
      })();

      return controller;
    },
    [setMounts],
  );

  const handleStreamedDataReset = useCallback(
    (payload: StreamedDataResetPayload) => {
      const streamedDataId = payload.streamedDataId;
      if (!streamedDataId) return;

      let hasMount = false;
      setMounts((prev) => {
        const exists = prev.some((mount) => matchesStreamedData(mount, streamedDataId));
        hasMount = exists;
        if (!exists) return prev;
        return prev.map((mount) => (matchesStreamedData(mount, streamedDataId) ? { ...mount, streamedData: undefined } : mount));
      });

      if (!hasMount) return;
      startStreamedDataStream(streamedDataId);
    },
    [startStreamedDataStream],
  );

  const handleStreamedDataChunk = useCallback(
    (payload: StreamedDataChunkPayload) => {
      const { streamedDataId, chunk } = payload;
      if (!streamedDataId || !chunk) return;

      const controller = jsonStreamsRef.current.get(streamedDataId) ?? startStreamedDataStream(streamedDataId);
      controller.push(chunk);
    },
    [startStreamedDataStream],
  );

  const handleDataPatch = useCallback((payload: DataPatchPayload) => {
    if (!payload.mountId || !payload.patches?.length) return;

    setMounts((prev) =>
      prev.map((mount) =>
        mount.mountId === payload.mountId
          ? { ...mount, data: applyDataPatches(mount.data, payload.patches) }
          : mount,
      ),
    );
  }, []);

  const handleServerEnvelope = useCallback(
    (raw: unknown) => {
      const envelope = parseServerEnvelope(raw);
      if (!envelope) {
        return;
      }

      switch (envelope.type) {
        case "session":
          setSession(envelope.payload);
          return;
        case "assistant_message":
          return;
        case "markdown_chunk":
          handleMarkdownChunk(envelope.payload);
          return;
        case "mount":
          handleMount(envelope.payload);
          return;
        case "streamed_data_reset":
          handleStreamedDataReset(envelope.payload);
          return;
        case "streamed_data_chunk":
          handleStreamedDataChunk(envelope.payload);
          return;
        case "data_patch":
          handleDataPatch(envelope.payload);
          return;
        case "trace":
          handleTrace(envelope.payload);
          return;
        case "log_line":
          console.debug("[server log]", envelope.payload);
          return;
        default:
          return;
      }
    },
    [handleTrace, handleMarkdownChunk, handleMount, handleStreamedDataReset, handleStreamedDataChunk, handleDataPatch],
  );

  const connectSocket = useCallback(() => {
    if (!mountedRef.current) return;
    const candidates = socketCandidatesRef.current;
    const url = candidates[currentCandidateRef.current] ?? candidates[0];
    console.log("attempting websocket", { url, candidates });
    setConnectionStatus("connecting");
    console.info("[ws] connecting", url);
    const socket = new WebSocket(url);
    socketRef.current = socket;
    let opened = false;

    socket.onopen = () => {
      if (!mountedRef.current) return;
      opened = true;
      setConnectionStatus("open");
      console.info("[ws] open", url);
    };

    socket.onmessage = (event) => {
      console.log("[ws] message", event.data);
      handleServerEnvelope(event.data);
    };

    socket.onerror = () => {
      if (!mountedRef.current) return;
      console.warn("[ws] error", url);
      setConnectionStatus("error");
    };

    socket.onclose = () => {
      if (!mountedRef.current) return;
      setConnectionStatus("closed");
      console.info("[ws] closed", url);

      // If this candidate never opened, try the next one immediately.
      if (!opened) {
        if (currentCandidateRef.current < socketCandidatesRef.current.length - 1) {
          currentCandidateRef.current += 1;
          console.info("[ws] retrying with next candidate", {
            next: socketCandidatesRef.current[currentCandidateRef.current],
          });
          connectSocketRef.current?.();
          return;
        }
      }

      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        connectSocketRef.current?.();
      }, RECONNECT_DELAY_MS);
    };
  }, [handleServerEnvelope]);

  useEffect(() => {
    connectSocketRef.current = connectSocket;
  }, [connectSocket]);

  useEffect(() => {
    if (!strictReadyRef.current) {
      strictReadyRef.current = true;
      return;
    }

    setTimeout(() => connectSocket(), 0);
    return () => {
      mountedRef.current = false;
      socketRef.current?.close();
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current);
      }
      messageIdleTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      messageIdleTimersRef.current.clear();
      jsonStreamsRef.current.forEach((controller) => controller.close());
      jsonStreamsRef.current.clear();
    };
  }, [connectSocket]);

  useEffect(() => {
    const node = messageListRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, mounts]);

  useEffect(() => {
    const node = tokenLogRef.current;
    if (!node || !tokenLogAutoScrollRef.current || !hasUserSentMessageRef.current) return;
    isProgrammaticScrollRef.current = true;
    requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 50);
    });
  }, [traceEntries]);

  const handleTokenLogScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;
    const node = tokenLogRef.current;
    if (!node) return;
    const threshold = 50;
    const isNearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < threshold;
    tokenLogAutoScrollRef.current = isNearBottom;
  }, []);

  const handleCopyTokens = useCallback(() => {
    if (!traceEntries.length) return;
    const text = traceEntries.map((e) => e.text).join("");
    navigator.clipboard.writeText(text).then(() => {
      setTokensCopied(true);
      setTimeout(() => setTokensCopied(false), 2000);
    });
  }, [traceEntries]);

  const handleSubmit = (text: string) => {
    const socket = socketRef.current;
    const ready = socket?.readyState === WebSocket.OPEN;
    if (!text || !ready) return;

    hasUserSentMessageRef.current = true;
    socket.send(JSON.stringify({ type: "user_message", payload: { text } }));

    setMessages((prev) => [
      ...prev,
      { id: createId("user"), role: "user", content: text, status: "complete", seq: nextSeq() },
    ]);
    markStreamActivity();
  };

  const connectionLabel: Record<ConnectionStatus, string> = {
    connecting: "Connecting…",
    open: "LLM Stream",
    closed: "Disconnected",
    error: "Error",
  };

  return (
    <div className="layout">
      <section className="pane debug-pane">
        <div className="pane-header">
          <div className="status-line">
            <span className={`status-dot status-${connectionStatus}`} />
            <div className="status-copy">
              <div className="status-label">{connectionLabel[connectionStatus]}</div>
            </div>
          </div>
          {traceEntries.length > 0 && (
            <button
              type="button"
              className="copy-button"
              onClick={handleCopyTokens}
              title="Copy tokens to clipboard"
            >
              {tokensCopied ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
        <div className="token-log" ref={tokenLogRef} onScroll={handleTokenLogScroll}>
          {traceEntries.length > 0 ? (
            groupTraceEntries(traceEntries).map((group) => (
              <div key={group.key} className={`trace-${group.category}`}>
                {group.text}
              </div>
            ))
          ) : (
            <p className="muted">Tokens from the LLM will show here as they stream.</p>
          )}
        </div>
      </section>

      <div className="pane chat-pane">
        <div className="chat-inner">
          <section className="chat-panel">
            <div className="messages" ref={messageListRef}>
              {[
                ...messages.map((m) => ({ kind: "message" as const, item: m, seq: m.seq })),
                ...mounts.map((m) => ({ kind: "mount" as const, item: m, seq: m.seq })),
              ]
                .sort((a, b) => a.seq - b.seq)
                .map((entry) =>
                  entry.kind === "message" ? (
                    <article
                      key={entry.item.id}
                      className={`message ${entry.item.status === "streaming" ? "message-streaming" : ""}`}
                    >
                      <div className="bubble">
                        <div className="bubble-meta">
                          <span className="role">{entry.item.role === "assistant" ? "Assistant" : "You"}</span>
                          {entry.item.status === "streaming" ? <span className="typing">typing</span> : null}
                        </div>
                        <p>{entry.item.content || "…"}</p>
                      </div>
                    </article>
                  ) : (
                    <article key={`mount-${entry.item.mountId}`} className="message">
                      <div className="bubble">
                        <div className="bubble-meta">
                          <span className="role">Agent UI</span>
                          <span className="typing">
                            {entry.item.streamedDataId ? `Stream ${shortId(entry.item.streamedDataId)}` : `Mount ${shortId(entry.item.mountId)}`}
                          </span>
                        </div>
                        <ComponentRender
                          source={entry.item.uiSource}
                          data={entry.item.data}
                          streamedData={entry.item.streamedData ?? {}}
                          outputSchema={entry.item.outputSchema}
                          callbackNames={entry.item.callbackNames}
                          onSubmit={(value) => {
                            const socket = socketRef.current;
                            const mountId = entry.item.mountId;
                            if (!socket || socket.readyState !== WebSocket.OPEN) {
                              console.warn("[ui_submit] cannot send - socket not ready");
                              return;
                            }
                            socket.send(JSON.stringify({
                              type: "ui_submit",
                              payload: { mountId, value },
                            }));
                          }}
                          onCallbackInvoke={(name, args) => {
                            const socket = socketRef.current;
                            const mountId = entry.item.mountId;
                            if (!socket || socket.readyState !== WebSocket.OPEN) {
                              console.warn("[callback_invoke] cannot send - socket not ready");
                              return;
                            }
                            socket.send(JSON.stringify({
                              type: "callback_invoke",
                              payload: { mountId, name, args },
                            }));
                          }}
                        />
                      </div>
                    </article>
                  ),
                )}
            </div>

            <ChatComposer
              onSubmit={handleSubmit}
              disabled={isStreaming || connectionStatus !== "open"}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

export default App;

function applyDataPatches(value: unknown, patches: DataPatch[]): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(value) ? cloneValue(value) : {};

  for (const patch of patches) {
    const [op, path, nextValue] = patch;
    if (!Array.isArray(path) || path.length === 0) continue;

    let cursor: unknown = base;
    for (let i = 0; i < path.length - 1; i += 1) {
      const key = path[i];
      const parent = cursor;
      if (!isRecord(parent) && !Array.isArray(parent)) {
        break;
      }

      const resolvedKey = resolvePatchKey(key, parent);
      const current = (parent as Record<string | number, unknown>)[resolvedKey];
      if (!isRecord(current) && !Array.isArray(current)) {
        const shouldBeArray = isNumericKey(path[i + 1]);
        const nextContainer: unknown = shouldBeArray ? [] : {};
        (parent as Record<string | number, unknown>)[resolvedKey] = nextContainer;
        cursor = nextContainer;
      } else {
        cursor = current;
      }
    }

    const targetParent = cursor;
    if (!isRecord(targetParent) && !Array.isArray(targetParent)) {
      continue;
    }

    const finalKey = resolvePatchKey(path[path.length - 1], targetParent);
    if (op === "set") {
      (targetParent as Record<string | number, unknown>)[finalKey] = nextValue;
    } else if (op === "delete") {
      if (Array.isArray(targetParent) && typeof finalKey === "number") {
        targetParent.splice(finalKey, 1);
      } else {
        delete (targetParent as Record<string | number, unknown>)[finalKey];
      }
    }
  }

  return base;
}

function createChunkStream() {
  const queue: string[] = [];
  const resolvers: Array<(value: IteratorResult<string>) => void> = [];
  let closed = false;

  const push = (chunk: string) => {
    if (closed) return;
    if (resolvers.length > 0) {
      const resolve = resolvers.shift();
      resolve?.({ value: chunk, done: false });
      return;
    }
    queue.push(chunk);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    while (resolvers.length > 0) {
      const resolve = resolvers.shift();
      resolve?.({ value: undefined, done: true });
    }
  };

  const iterable: AsyncIterable<string> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<string>> {
          if (queue.length > 0) {
            const nextValue = queue.shift() as string;
            return Promise.resolve({ value: nextValue, done: false });
          }
          if (closed) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise((resolve) => resolvers.push(resolve));
        },
      };
    },
  };

  return { iterable, push, close };
}

function matchesStreamedData(mount: MountInstance, streamedDataId: string): boolean {
  return mount.streamedDataId === streamedDataId;
}

function resolvePatchKey(key: string | symbol, parent: unknown): string | number | symbol {
  if (Array.isArray(parent) && isNumericKey(key)) {
    return Number(key);
  }
  return typeof key === "symbol" ? key : String(key);
}

function isNumericKey(key: unknown): key is string | number {
  if (typeof key === "number") return Number.isFinite(key);
  if (typeof key !== "string") return false;
  return /^[0-9]+$/.test(key);
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return value === undefined ? ({} as T) : JSON.parse(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseServerEnvelope(raw: unknown): ServerToClientEnvelope | null {
  if (typeof raw !== "string") return null;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.type === "string" && "payload" in parsed) {
      return parsed as ServerToClientEnvelope;
    }
  } catch {
    return null;
  }

  return null;
}

type TraceGroup = {
  key: string;
  category: TraceCategory;
  text: string;
};

const MERGEABLE_CATEGORIES = new Set<TraceCategory>(["llm", "system"]);

function groupTraceEntries(entries: TraceEntry[]): TraceGroup[] {
  const groups: TraceGroup[] = [];

  for (const entry of entries) {
    const last = groups[groups.length - 1];
    const canMerge =
      last &&
      last.category === entry.category &&
      MERGEABLE_CATEGORIES.has(entry.category);

    if (canMerge) {
      last.text += entry.text;
    } else {
      groups.push({
        key: entry.id,
        category: entry.category,
        text: entry.text,
      });
    }
  }

  return groups;
}
