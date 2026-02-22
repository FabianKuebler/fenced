import {
  StreamingExecutor,
  type StreamingRun,
} from "bun-streaming-exec";
import type { RuntimeChannel } from ".";
import { MountManager } from "./mount-manager";
import { Data, StreamedData } from "./data-manager";

type ExecutionManagerInit = {
  channel: RuntimeChannel;
  skills?: Record<string, unknown>;
};

export class ExecutionManager {
  private readonly executor: StreamingExecutor;
  private readonly mountManager: MountManager;

  constructor({ channel, skills = {} }: ExecutionManagerInit) {
    this.mountManager = new MountManager(channel);
    this.executor = new StreamingExecutor({
      context: {
        Data,
        StreamedData,
        mount: this.mountManager.mount,
        ...skills,
      },
      jsx: true,
    });
  }

  run(lines: AsyncIterable<string>): StreamingRun {
    return this.executor.run(lines);
  }

  invokeCallback(mountId: string, name: string, args: unknown[]): void {
    this.mountManager.invokeCallback(mountId, name, args);
  }

  stop(): void {
    // Could be added if needed for cancellation
  }
}
