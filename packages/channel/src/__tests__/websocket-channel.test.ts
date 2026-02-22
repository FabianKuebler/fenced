import { describe, expect, it } from "bun:test";
import type { ServerWebSocket } from "bun";
import { WebSocketChannel, type SocketContext } from "../websocket-channel";
import type { Session } from "@fenced/session";

const stubSession: Session = {
  id: "session-123",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
} as Session;

describe("WebSocketChannel", () => {
  it("sends the session envelope with defaults from options", () => {
    const socket = createSocketStub();
    const channel = new WebSocketChannel(socket.socket, stubSession, { schemaVersion: 2 });

    channel.sendSession({ capabilities: { markdown_stream: true } });

    expect(socket.sent.length).toBe(1);
    const frame = socket.sent[0];
    if (!frame) throw new Error("No session frame captured");
    expect(JSON.parse(frame)).toEqual({
      type: "session",
      payload: {
        id: "session-123",
        createdAt: "2024-01-01T00:00:00.000Z",
        schemaVersion: 2,
        capabilities: { markdown_stream: true },
      },
    });
  });

  it("streams markdown chunks and skips empty tokens", async () => {
    const socket = createSocketStub();
    const channel = new WebSocketChannel(socket.socket, stubSession);

    const chunks = (async function* (): AsyncGenerator<string> {
      yield "";
      yield "hello";
      yield "";
      yield "world";
    })();

    await channel.sendMarkdown({ interactionId: "i-1", messageId: "m-1" }, chunks);

    expect(socket.sent.length).toBe(2);
    const envelopes = socket.sent.map((frame) => JSON.parse(frame));
    expect(envelopes).toEqual([
      {
        type: "markdown_chunk",
        payload: { interactionId: "i-1", messageId: "m-1", text: "hello" },
      },
      {
        type: "markdown_chunk",
        payload: { interactionId: "i-1", messageId: "m-1", text: "world" },
      },
    ]);
  });

  it("resets streamed data before streaming chunks", async () => {
    const socket = createSocketStub();
    const channel = new WebSocketChannel(socket.socket, stubSession);

    const dataStream = (async function* (): AsyncGenerator<string> {
      yield "";
      yield '{"foo":1}';
    })();

    await channel.sendStreamedData("data-42", dataStream);

    expect(socket.sent.length).toBe(2);
    const envelopes = socket.sent.map((frame) => JSON.parse(frame));
    expect(envelopes[0]).toEqual({
      type: "streamed_data_reset",
      payload: { streamedDataId: "data-42" },
    });
    expect(envelopes[1]).toEqual({
      type: "streamed_data_chunk",
      payload: { streamedDataId: "data-42", chunk: '{"foo":1}' },
    });
  });
});

function createSocketStub(): {
  socket: ServerWebSocket<SocketContext>;
  sent: string[];
} {
  const sent: string[] = [];
  const socket = {
    send: (data: string) => {
      sent.push(data);
    },
    close: () => {},
  } as unknown as ServerWebSocket<SocketContext>;

  return { socket, sent };
}
