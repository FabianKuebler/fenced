import { describe, expect, it } from "bun:test";
import { ExecutionManager } from "../execution-manager";
import type { RuntimeChannel } from "..";
import type { DataPatchPayload, MountPayload } from "@fenced/shared";
import { z } from "zod";

class TestChannel implements Partial<RuntimeChannel> {
  mounts: MountPayload[] = [];
  patches: DataPatchPayload[] = [];
  logs: unknown[] = [];

  sendMount = async (payload: MountPayload): Promise<unknown> => {
    this.mounts.push(payload);
    return undefined;
  };

  sendDataPatch = (payload: DataPatchPayload) => {
    this.patches.push(payload);
  };

  log(entry: unknown): void {
    this.logs.push(entry);
  }
}

describe("ExecutionManager", () => {
  it("exposes Data and mount that stream to the channel", async () => {
    const channel = new TestChannel();
    const manager = new ExecutionManager({ channel: channel as unknown as RuntimeChannel, skills: { z } });

    const source = `
      const data = new Data({ count: 0 });
      mount({
        data,
        outputSchema: z.object({ count: z.number() }),
        ui: (state) => ({ view: state.count }),
      });
      data.count = 2;
    `;

    // Create async iterable from source string
    async function* toChunks(code: string): AsyncIterable<string> {
      yield code;
    }

    const run = manager.run(toChunks(source));

    // Consume events to drive execution
    for await (const _event of run.events) {
      // Events are consumed
    }

    const result = await run.result;

    expect(result.error).toBeUndefined();
    expect(channel.mounts).toHaveLength(1);
    expect(channel.mounts[0]!.mountId).toBeDefined();
    expect(channel.mounts[0]!.initialData).toEqual({ count: 0 });
    // Zod schema is converted to JSON Schema
    const outputSchema = channel.mounts[0]!.outputSchema;
    expect(outputSchema.type).toBe("object");
    expect(outputSchema.properties).toEqual({ count: { type: "number" } });
    expect(outputSchema.required).toEqual(["count"]);
    expect(outputSchema.additionalProperties).toBe(false);

    expect(channel.patches).toHaveLength(1);
    const firstMount = channel.mounts[0]!;
    const firstPatch = channel.patches[0]!;
    expect(firstPatch.mountId).toBe(firstMount.mountId!);
    expect(firstPatch.patches).toEqual([
      ["set", ["count"], 2, 0],
    ]);
  });
});
