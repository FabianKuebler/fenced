import { describe, expect, test } from "bun:test";
import {
  encodeServerEnvelope,
  parseClientEnvelope,
  type ServerToClientEnvelope,
} from "../protocol";

describe("parseClientEnvelope", () => {
  test("parses valid user messages", () => {
    const raw = JSON.stringify({
      type: "user_message",
      payload: { text: "hello world" },
    });
    const result = parseClientEnvelope(raw);
    expect(result.ok).toBe(true);
    if (!result.ok || result.envelope.type !== "user_message") {
      throw new Error("expected user_message");
    }
    expect(result.envelope.payload.text).toBe("hello world");
    expect(result.envelope.payload.interactionId).toBeUndefined();
  });

  test("accepts ArrayBuffer frames", () => {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(
      JSON.stringify({
        type: "ui_submit",
        payload: { mountId: "mount-1", value: { x: 1 } },
      }),
    ).buffer;
    const result = parseClientEnvelope(buffer);
    expect(result.ok).toBe(true);
    if (!result.ok || result.envelope.type !== "ui_submit") {
      throw new Error("expected ui_submit");
    }
    expect(result.envelope.payload.mountId).toBe("mount-1");
  });

  test("rejects invalid payloads", () => {
    const result = parseClientEnvelope('{"type":"unknown","payload":{}}');
    expect(result.ok).toBe(false);
  });
});

describe("encodeServerEnvelope", () => {
  test("stringifies the envelope", () => {
    const envelope: ServerToClientEnvelope = {
      type: "session",
      payload: { id: "sess", createdAt: new Date(0).toISOString() },
    };
    const serialized = encodeServerEnvelope(envelope);
    expect(serialized).toContain('"type":"session"');
    expect(serialized).toContain('"id":"sess"');
  });
});
