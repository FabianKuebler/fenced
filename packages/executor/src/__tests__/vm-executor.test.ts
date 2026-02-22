import { describe, expect, it } from "bun:test";
import * as vm from "node:vm";
import { VmExecutor } from "../vm-executor";

describe("VmExecutor", () => {
  it("captures console output", async () => {
    const context = vm.createContext({});
    const executor = new VmExecutor(context);

    const result = await executor.run(`
      console.log("hello");
      console.error("world");
    `);

    expect(result.error).toBe("");
    expect(result.logs).toContain("hello");
    expect(result.logs).toContain("world");
  });

  it("shares globals between runs", async () => {
    const context = vm.createContext({});
    const executor = new VmExecutor(context);

    await executor.run(`
      globalThis.value = 21;
    `);

    const result = await executor.run(`
      console.log(value * 2);
    `);

    expect(result.error).toBe("");
    expect(result.logs).toContain("42");
  });

  it("captures thrown errors", async () => {
    const context = vm.createContext({});
    const executor = new VmExecutor(context);

    const result = await executor.run(`
      throw new Error("boom");
    `);

    expect(result.error).toContain("boom");
  });

  it("can stop a running execution", async () => {
    const context = vm.createContext({});
    const executor = new VmExecutor(context);

    const pending = executor.run(`
      await new Promise((resolve) => setTimeout(resolve, 50));
      console.log("after await");
    `);

    executor.stop();

    const result = await pending;
    expect(result.error).toBe("Execution stopped");
    expect(result.logs).not.toContain("after await");
  });

  it("runs TSX code", async () => {
    const reactShim = {
      createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => {
        const normalizedProps = { ...(props ?? {}) };
        if (children.length === 1) {
          normalizedProps.children = children[0];
        } else if (children.length > 1) {
          normalizedProps.children = children;
        }
        return { type, props: normalizedProps };
      },
      Fragment: Symbol.for("react.fragment"),
    };

    const context = vm.createContext({ React: reactShim });
    const executor = new VmExecutor(context);

    const result = await executor.run(`
      const name: string = "Ada";
      const view = <div className="card">{name.toUpperCase()}</div>;
      console.log(view);
    `);

    expect(result.error).toBe("");
    expect(result.logs).toContain("div");
    expect(result.logs).toContain("card");
    expect(result.logs).toContain("ADA");
  });

  it("enforces a timeout", async () => {
    const context = vm.createContext({});
    const executor = new VmExecutor(context);

    const result = await executor.run(
      `
      await new Promise((resolve) => setTimeout(resolve, 20));
      console.log("should not see");
    `,
      { timeoutMs: 5 },
    );

    expect(result.error).toContain("timed out");
    expect(result.logs).not.toContain("should not see");
  });
});
