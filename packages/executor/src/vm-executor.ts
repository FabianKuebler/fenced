import { Console as NodeConsole } from "node:console";
import { Writable } from "node:stream";
import * as vm from "node:vm";

export type VmRunResult = {
  logs: string;
  error: string;
};

export type VmRunOptions = {
  timeoutMs?: number;
};

export class VmExecutor {
  private readonly context: vm.Context;
  private readonly console: InstanceType<typeof NodeConsole>;
  private readonly transpiler: Bun.Transpiler;
  private logBuffer?: string[];
  private running = false;
  private stopReject?: (reason?: unknown) => void;

  constructor(context?: vm.Context) {
    this.context = context ?? vm.createContext({});
    this.console = this.createConsole();
    this.transpiler = new Bun.Transpiler({
      loader: "tsx",
      target: "bun",
      tsconfig: {
        compilerOptions: {
          jsx: "react",
          jsxFactory: "React.createElement",
          jsxFragmentFactory: "React.Fragment",
        },
      },
    });
    this.ensureBindings();
  }

  async run(source: string, options: VmRunOptions = {}): Promise<VmRunResult> {
    if (this.running) {
      throw new Error("A run is already in progress.");
    }

    this.running = true;
    this.logBuffer = [];
    this.ensureConsoleBinding();

    let error = "";
    let logsSnapshot: string[] = [];
    let capturedError: unknown;
    let timer: Timer | undefined;
    const stopPromise = new Promise<never>((_, reject) => {
      this.stopReject = reject;
      const timeoutMs = options.timeoutMs;
      if (Number.isFinite(timeoutMs) && timeoutMs && timeoutMs > 0) {
        timer = setTimeout(() => reject(new VmExecutionTimeoutError(timeoutMs)), timeoutMs);
      }
    });

    try {
      const compiled = this.transpile(source);
      const module = new vm.SourceTextModule(compiled, {
        context: this.context,
        identifier: "vm-executor",
      });

      await module.link((specifier) => {
        throw new Error(`Imports are not supported in VmExecutor runs: ${specifier}`);
      });

      await module.evaluate();
      const runner = (module.namespace as { __run?: () => Promise<unknown> }).__run;
      if (!runner) {
        throw new Error("VmExecutor failed to expose a runner for the provided source.");
      }

      const execution = runner();
      execution.catch((err) => {
        if (capturedError === undefined) {
          capturedError = err;
        }
      });

      try {
        await Promise.race([execution, stopPromise]);
      } catch (err) {
        if (capturedError === undefined) {
          capturedError = err;
        }
      }
    } catch (err) {
      error = this.formatError(err);
    } finally {
      logsSnapshot = this.logBuffer ? [...this.logBuffer] : [];
      this.logBuffer = undefined;
      if (timer) {
        clearTimeout(timer);
      }
      this.stopReject = undefined;
      this.running = false;
    }

    const finalError = error || (capturedError !== undefined ? this.formatError(capturedError) : "");
    return { logs: logsSnapshot.join(""), error: finalError };
  }

  stop(reason?: unknown): void {
    if (!this.stopReject) {
      return;
    }
    this.stopReject(reason ?? new VmExecutionStoppedError());
    this.stopReject = undefined;
  }

  private ensureBindings(): void {
    const contextRecord = this.context as Record<string, unknown>;
    if (!contextRecord.globalThis) {
      contextRecord.globalThis = contextRecord;
    }
    if (!contextRecord.setTimeout) {
      Object.assign(contextRecord, {
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        queueMicrotask,
      });
    }
    this.ensureConsoleBinding();
  }

  private ensureConsoleBinding(): void {
    const contextRecord = this.context as Record<string, unknown>;
    contextRecord.console = this.console as unknown as Console;
    if (contextRecord.globalThis && typeof contextRecord.globalThis === "object") {
      (contextRecord.globalThis as Record<string, unknown>).console = contextRecord.console;
    }
  }

  private createConsole(): InstanceType<typeof NodeConsole> {
    const sink = new Writable({
      write: (chunk, _encoding, callback) => {
        if (this.logBuffer) {
          const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
          this.logBuffer.push(text);
        }
        callback();
      },
    });

    return new NodeConsole({
      stdout: sink,
      stderr: sink,
      colorMode: false,
    });
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "object" && error !== null) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.length > 0) {
        return message;
      }
    }
    return String(error);
  }

  private wrapSource(source: string): string {
    return `
      export const __run = async () => {
        ${source}
      };
    `;
  }

  private transpile(source: string): string {
    return this.transpiler.transformSync(this.wrapSource(source), "tsx");
  }
}

class VmExecutionStoppedError extends Error {
  constructor() {
    super("Execution stopped");
    this.name = "VmExecutionStoppedError";
  }
}

class VmExecutionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Execution timed out after ${timeoutMs}ms`);
    this.name = "VmExecutionTimeoutError";
  }
}

type Timer = ReturnType<typeof setTimeout>;
