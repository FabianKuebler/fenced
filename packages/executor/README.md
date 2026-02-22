# @fenced/executor

Sandboxed runtime for executing streamed agent code. It transpiles TS/TSX snippets with Bun, runs them inside a persistent `node:vm` context, captures console output, and streams state changes/UI mounts over a `RuntimeChannel`.

## What it does
- `VmExecutor` wraps `vm.SourceTextModule` to run TSX snippets with timeout/stop controls while capturing stdout/stderr.
- `Data` provides Valtio-backed mutable objects; snapshots and patch subscriptions drive live updates to clients.
- `StreamedData` provides a proxy-based container for receiving streamed JSON updates targeted by `json agent.data` blocks.
- `MountManager` transpiles UI functions into browser-ready sources and forwards mount payloads/results across the channel.
- `ExecutionManager` wires everything together, exposing `Data`, `StreamedData`, and `mount` in the VM context alongside optional skills.

## Usage
```ts
import { ExecutionManager } from "@fenced/executor";
import type { RuntimeChannel } from "@fenced/channel";

const manager = new ExecutionManager({ channel: myChannel as RuntimeChannel, skills: { z } });
const result = await manager.run(`
  const data = new Data({ count: 1 });
  mount({ data, ui: (state) => <div>{state.count}</div> });
  data.count += 1;
`);

console.log(result.logs); // console output from the run
```
