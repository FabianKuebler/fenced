# Agentic Chat Runtime Spec

A conversational AI that writes **markdown**, executes **`tsx agent.run`** blocks server-side, and streams **`json agent.data`** to reactive UI components on the client.

---

## Terms

- **Session** — One WebSocket connection + one `node:vm` context inside a shared Bun process.
- **Interaction** — Starts on user message; includes 0+ auto follow-up turns until runtime logs are empty.
- **Model turn** — One LLM call producing one assistant message.

---

## Lifecycle

1. User sends message → starts interaction
2. LLM generates markdown + blocks
3. Server executes `tsx agent.run` blocks top-to-bottom, streams `json agent.data` to client
4. If runtime log transcript is **non-empty** → next model turn with transcript as input
5. If runtime log transcript is **empty** → interaction ends; wait for user

### Interaction Loop (Pseudo-code)

```ts
async function runInteraction({ sessionId, interactionId, userText }) {
  let turn = 0;
  let transcript: LlmLogsPayload = {};

  while (turn++ < MAX_TURNS) {
    // First turn uses userText, subsequent turns use transcript
    const stream = turn === 1
      ? llm.userQuery(userText)
      : llm.logs(transcript);

    for await (const segment of parser.parse(stream)) {
      switch (segment.kind) {
        case 'markdown':
          await channel.sendMarkdown(ctx, segment.tokens);
          break;

        case 'agent_run':
          // Streaming execution - tokens pipe as they arrive
          const run = executor.run(segment.sourceTokens);
          for await (const event of run.events) {
            // Log each statement execution
          }
          const result = await run.result;
          transcript = mergeTranscripts(transcript, result);
          break;

        case 'agent_data':
          // Check target exists
          if (!StreamedData.hasId(segment.streamedDataId)) {
            console.error('unknown_target:', segment.streamedDataId);
            break;
          }
          // Stream to client, then resolve on server after fence completes
          const jsonChunks: string[] = [];
          await channel.sendStreamedData(segment.streamedDataId, (async function*() {
            for await (const chunk of segment.jsonTokens) {
              jsonChunks.push(chunk);
              yield chunk;
            }
          })());
          const streamed = StreamedData.getById(segment.streamedDataId);
          if (streamed) {
            StreamedData.setData(streamed, JSON.parse(jsonChunks.join('')));
          }
          break;
      }
    }

    if (!hasTranscript(transcript)) break; // interaction ends
    transcript = {};
  }
}
```

---

## Blocks & Execution

- Blocks execute **top-to-bottom** within a message
- Each `tsx agent.run` completes before the next block starts
- All code runs in the **same `node:vm` context** per session (variables persist)
- `json agent.data` **must target an existing `StreamedData` by ID**
- If `agent.run` throws → remaining blocks in that message **do not execute**
- If `agent.data` targets unknown ID → skip block, log `unknown_target`, continue

---

## StreamedData API

```tsx
const streamed = new StreamedData("stats");
// Later: ```json agent.data => "stats"
// {"count": 10, "avg": 12.4}
// ```
console.log(streamed.count);  // 10
```

- `new StreamedData(id)` creates a streaming target (ID must be unique per session)
- Properties accessed directly: `streamed.myField`
- Server: populated after fence completes
- Client: populated incrementally via streaming JSON parser
- Each new `agent.data` block **replaces** (not merges) the value

### Implementation (Server)

```ts
class StreamedData {
  readonly id: string;
  private static registry = new Map<string, StreamedData>();

  constructor(id: string) {
    this.id = id;
    StreamedData.registry.set(id, this);
    // Return Proxy for transparent property access
    return new Proxy(this, {
      get(target, prop) {
        if (prop === 'id' || typeof prop === 'symbol') return Reflect.get(target, prop);
        return StreamedData.getData(target)[prop as string];
      }
    });
  }

  // Static methods for data management
  static getId(streamed: StreamedData): string { return streamed.id; }
  static setData(streamed: StreamedData, data: Record<string, unknown>): void { /* full replace */ }
  static getData(streamed: StreamedData): Record<string, unknown> { /* return internal data */ }
  static getById(id: string): StreamedData | undefined { return this.registry.get(id); }
  static hasId(id: string): boolean { return this.registry.has(id); }
  static unregister(id: string): boolean { return this.registry.delete(id); }
  static clearRegistry(): void { this.registry.clear(); }
}
```

---

## Mount API

```tsx
const data = new Data({ /* initial state */ });
const streamed = new StreamedData("my-stream");
const comp = mount({
  data,                                           // optional reactive state
  streamedData: streamed,                         // optional streaming target
  outputSchema: z.object({ name: z.string() }),   // Zod schema for form output
  callbacks: { onRefresh: () => { ... } },        // optional server-side callbacks
  ui: ({ data, streamedData, output, callbacks }) => JSX
});
const result = await comp.result;  // resolves on valid form submit
```

### What mount() Does

**Server-side:**
1. Registers the component in session-wide registry
2. Takes a snapshot of `data`'s initial state
3. Serializes the `ui` function to a string
4. Sends a `mount` message over WebSocket with uiSource, initialData, outputSchemaShape

**Client-side:**
1. Creates local mirrors: `dataMirror` (Valtio proxy), `streamedData`, `output` binder tree
2. Compiles `uiSource` back into a React component via `new Function`
3. Renders the component in the chat stream

### Data (server-side)

- `new Data(initial)` returns a **Valtio proxy**; mutations stream to client
- Direct mutations: `data.progress = 50`, `data.items.push("x")`
- **Conflict policy:** replace-at-path (later write wins)

```ts
class Data<T extends object> {
  private static registry = new Map<DataId, object>();

  constructor(initial: T) {
    const state = proxy(initial);
    Data.registry.set(id, state);
    return state;  // Returns proxied object directly
  }

  // Static methods for data management
  static getId(data: object): DataId { /* lookup in registry */ }
  static snapshot<T extends object>(data: T): T { return snapshot(data); }
  static subscribeToChanges(data: object, listener: DataPatchListener): () => void {
    return subscribe(data, (ops) => {
      // Convert Valtio ops to DataPatch[], invoke listener
    });
  }
}
```

### Callbacks

```tsx
mount({
  data,
  callbacks: {
    onIncrement: () => { data.count += 1; }
  },
  ui: ({ data, callbacks }) => (
    <Button onClick={() => callbacks.onIncrement()}>+1</Button>
  )
});
```

- Fire-and-forget (no return values)
- Execute synchronously; Data mutations stream to UI

### UI Props

| Prop | Description |
|------|-------------|
| `data` | Server `Data` mirror via Valtio (may be undefined) |
| `streamedData` | `StreamedData` instance (may be undefined) |
| `output` | Form field binder tree |
| `callbacks` | Server-side callback proxy |

---

## Output Binder

The `output` object mirrors the Zod schema structure:

### Scalars

| Zod type | Binder shape |
|----------|--------------|
| `z.string()` | `{ value, onChange, error?, touched }` |
| `z.number()` | `{ value, onChange, error?, touched }` |
| `z.boolean()` | `{ checked, onChange, error?, touched }` |
| `z.enum([...])` | `{ value, onChange, options, error? }` |

### Objects & Arrays

- Objects: nested binders (`output.field.subfield`)
- Arrays: `output.items` array + helpers (`push`, `remove`, `move`)

### Form Submit

```tsx
<Button type="submit" {...output}>Submit</Button>
```

- Triggers Zod validation on server; resolves `comp.result` on success
- On validation failure: server sends errors back to binders (`output.field.error`)

---

## Transport (WebSocket)

Single WebSocket per session. JSON envelopes: `{ type, payload }`.

### Server → Client

| Type | Payload |
|------|---------|
| `session` | `{ id, createdAt, schemaVersion?, capabilities? }` |
| `assistant_message` | `{ interactionId, messageId, markdown, blocks }` |
| `markdown_chunk` | `{ interactionId, messageId, text }` |
| `mount` | `{ mountId, uiSource, initialData?, streamedDataId?, outputSchema, callbackNames? }` |
| `data_patch` | `{ mountId, patches }` |
| `streamed_data_reset` | `{ streamedDataId }` |
| `streamed_data_chunk` | `{ streamedDataId, chunk }` |
| `log_line` | `{ t?, lvl, msg?, data?, code?, runId?, blockIndex?, src? }` |
| `trace` | `{ interactionId, messageId, text, category }` |

### Client → Server

| Type | Payload |
|------|---------|
| `user_message` | `{ text, interactionId? }` |
| `ui_submit` | `{ mountId, value }` |
| `callback_invoke` | `{ mountId, name, args }` |
| `client_log` | `{ lvl, msg?, data? }` |

---

## Runtime Logs

Console calls are intercepted and serialized:

```ts
type LogLevel = "debug" | "info" | "warn" | "error";

type LogLine = {
  t?: string;           // ISO8601 timestamp
  lvl: LogLevel;
  msg?: string;
  data?: unknown;
  code?: string;        // error/event code
  runId?: string;
  blockIndex?: number;
  src?: "server" | "client";
};
```

**Runtime events:** `mount:ok`, `ui:submit`, `data:apply`, `streamed_data:ok`

**Trace categories:** `system`, `example_user`, `example_assistant`, `llm`, `user`, `exec_result`, `exec_error`

**Error codes:**
- `unknown_target` — `agent.data` targets non-existent StreamedData ID
- `run_timeout` — `agent.run` exceeded time limit
- `block_failed` — `agent.run` threw an exception
- `session_closed` — WebSocket disconnected
- `json_error` — malformed JSON in `agent.data` block
- `invalid_envelope` — malformed inbound WebSocket message

---

## Architecture

### Monorepo Structure

```
apps/
  client/     # React + Vite
  server/     # Bun HTTP/WebSocket (entry: index.ts)
packages/
  shared/     # Protocol types (@fenced/shared)
  channel/    # WebSocketChannel transport
  session/    # Session model
  runtime/    # Interaction loop orchestration
  llm/        # LLM streaming (Vercel AI SDK)
  parser/     # Markdown parser, extracts agent.run/agent.data
  executor/   # VM execution, Data proxy, mount manager
  skills/     # Skill discovery and injection
  component-render/  # Client-side UI rendering
```

### Module Contracts

**@fenced/llm**
```ts
class Llm {
  userQuery(text: string): AsyncIterable<LlmTextChunk>;
  logs(payload: { logs?: string; error?: string }): AsyncIterable<LlmTextChunk>;
  getHistory(): ChatMessage[];
  getInitialHistory(): ChatMessage[];
  whenReady(): Promise<void>;
  reset(): Promise<void>;
}

async function createDefaultLlm(options: CreateDefaultLlmOptions): Promise<Llm>;
```

**@fenced/parser**
```ts
type ParserSegment = MarkdownSegment | AgentRunSegment | AgentDataSegment;
function parse(chunks: AsyncIterable<{text: string}>): AsyncIterable<ParserSegment>;
```

**@fenced/executor**
```ts
// Data class - Valtio-based reactive state
class Data<T extends object> {
  constructor(initial: T);  // Returns proxied object
  static getId(data: object): DataId;
  static snapshot<T extends object>(data: T): T;
  static subscribeToChanges(data: object, listener: DataPatchListener): () => void;
}

// StreamedData class - Proxy-based streaming target
class StreamedData {
  constructor(id: string);  // Uses Proxy for property access
  readonly id: string;
  static getId(streamed: StreamedData): string;
  static setData(streamed: StreamedData, data: Record<string, unknown>): void;
  static getData(streamed: StreamedData): Record<string, unknown>;
  static getById(id: string): StreamedData | undefined;
  static hasId(id: string): boolean;
  static unregister(id: string): boolean;
  static clearRegistry(): void;
}

// ExecutionManager - orchestrates VM execution and mounts
class ExecutionManager {
  constructor(options: { channel: RuntimeChannel; skills?: Record<string, unknown> });
  run(lines: AsyncIterable<string>): StreamingVmRun;
  invokeCallback(mountId: string, name: string, args: unknown[]): void;
  stop(): void;
}

// MountManager - handles component mounts
class MountManager {
  constructor(channel: RuntimeChannel);
  mount<TData, TStreamedData, TOutput, TCallbacks>(
    options: MountOptions<TData, TStreamedData, TOutput, TCallbacks>
  ): MountedComponent<TOutput>;
  invokeCallback(mountId: string, name: string, args: unknown[]): void;
}
```

**@fenced/runtime**
```ts
class Runtime {
  constructor(channel: RuntimeChannel);
  init(): Promise<void>;
  newInteraction(userQuery: string): Promise<{ interactionId: InteractionId }>;
  stop(): void;
  invokeCallback(payload: CallbackInvokePayload): void;
  static loadSkills(): Promise<{ runtime: Record<string, unknown>; data: SkillData[] }>;
}
```

**@fenced/channel**
```ts
interface RuntimeChannel {
  sendMarkdown?(ctx: MarkdownStreamContext, stream: AsyncIterable<string>): Promise<void>;
  sendStreamedData?(streamedDataId: StreamedDataId, stream: AsyncIterable<string>): Promise<void>;
  sendMount(payload: MountPayload): void;
  sendDataPatch(payload: DataPatchPayload): void;
  sendAssistantMessage?(payload: AssistantMessagePayload): void;
  sendTrace?(payload: TracePayload): void;
  log(line: LogLine): void;
}
```

### Data Flow

1. User message → WebSocket → Server creates interaction
2. LLM generates markdown + blocks
3. Parser extracts blocks; executor runs in `node:vm` context
4. Runtime logs trigger next model turn if non-empty
5. Mounts stream UI source + data to client

---

## Client-Side Rendering

### Compiling uiSource

The server sends `uiSource` as a function string. Client compiles it:

```ts
const makeUi = new Function("React", "z", "components", `return (${uiSource});`);
const ui = makeUi(React, z, baseComponents);
// ui is now ({ data, streamedData, output, callbacks }) => JSX
```

### Reactive State (Valtio)

**Data mirroring:**
- Client creates a Valtio proxy from `initialData`
- On `data_patch` messages: apply patches to the proxy
- React components use `useSnapshot()` for automatic re-renders

**StreamedData:**
- Built incrementally from `streamed_data_chunk` messages via streaming JSON parser
- Fully replaced on each new `agent.data` block (after `streamed_data_reset`)

**Precedence in UI:**
```tsx
<Typography>{streamedData?.title ?? data?.title}</Typography>
```

---

## Skills

Skills live in `packages/skills/src/skills/<name>/`:

| File | Purpose |
|------|---------|
| `SKILL.md` | Description for LLM prompt (~10-20 lines) |
| `index.d.ts` | TypeScript declarations shown to model |
| `index.ts` | Runtime implementation (injected as globals) |

- `readSkillsData()` aggregates all skills into the system prompt
- `loadRuntimeSkills()` loads and returns runtime implementations for injection
- Runtime functions are injected as globals in `agent.run` (no imports needed)
- Keep `index.d.ts` small and focused; no heavy third-party types

---

## Configuration

Set `OPENAI_API_KEY` in `.env`:

```
OPENAI_API_KEY=sk-...
```

---

## UI Globals

Available in `ui` function without imports:

- `z` — Zod
- MUI components: `Box`, `Card`, `Typography`, `TextField`, `Button`, `Select`, `MenuItem`, `Checkbox`, `LinearProgress`, `List`, `ListItem`, `Alert`, `Stack`, `Grid`, etc.

---

## UI Layout

### Chat Timeline
- Scrollable area with messages in chronological order
- **User messages**: right-aligned bubbles
- **Assistant messages**: left-aligned, markdown-rendered
- **Mounted UIs**: panels inserted under the assistant message that created them

### Input Area
- Text input + Send button at bottom
- **Disabled** while interaction is ongoing (agent.run executing)

### Mount Panels
- Rendered as cards in the chat stream
- Show title, progress, form elements as defined by `ui` function
- On form submit: disable controls, send `ui_submit`, re-enable on response

### Error States
- `block_failed`: inline error in panel ("This panel failed to load")
- WebSocket disconnect: banner ("Connection lost. Refresh to start a new session.")

---

## Limits & Security

- **No sandboxing** — prototype only, trusted environment
- **Single user / no auth**
- **Max 60s** per `agent.run`
- **In-memory only** — no persistence; state lost on restart
- JSX executed via `new Function` with full browser access
- Additional limits (implementation-defined): max mounts per session, max patch rate

---

## Example: Wizard

```tsx agent.run
const data = new Data({ title: "Create project", regions: ["eu","us"], progress: 0 });
const comp = mount({
  data,
  outputSchema: z.object({
    projectName: z.string().min(1),
    region: z.enum(["eu","us"])
  }),
  ui: ({ data, output }) => (
    <Card sx={{ p: 2 }}>
      <Typography variant="h5">{data.title}</Typography>
      <LinearProgress variant="determinate" value={data.progress} />
      <TextField {...output.projectName} label="Project name" />
      <Select {...output.region} label="Region">
        {data.regions.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
      </Select>
      <Button type="submit" variant="contained" {...output}>Create</Button>
    </Card>
  )
});

data.progress = 30;
const { projectName, region } = await comp.result;
console.info("provision:done", { projectName, region });
```

## Example: StreamedData

```tsx agent.run
const streamed = new StreamedData("export-stats");
mount({
  streamedData: streamed,
  outputSchema: z.object({ confirm: z.boolean() }),
  ui: ({ streamedData, output }) => (
    <Card>
      {streamedData?.count && <Typography>Count: {streamedData.count}</Typography>}
      <Checkbox {...output.confirm} />
      <Button type="submit" {...output}>Confirm</Button>
    </Card>
  )
});
```

```json agent.data => "export-stats"
{ "count": 42, "avg": 12.5 }
```
