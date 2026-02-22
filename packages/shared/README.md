# @fenced/shared

Common types, constants, and protocol helpers shared across the monorepo. It defines the websocket envelopes used by the runtime plus a few workspace metadata helpers.

## What it does
- Exposes constants like `PROJECT_NAME`, `API_PORT`, and helpers such as `describeWorkspace`.
- Defines protocol types for sessions, assistant messages, markdown/data streaming, mounts, and logs.
- Provides `encodeServerEnvelope`/`parseClientEnvelope` to serialize and validate websocket frames from clients.
- Normalizes incoming frames from strings, ArrayBuffers, or typed arrays for robust server handling.

## Usage
```ts
import { encodeServerEnvelope, parseClientEnvelope, API_PORT } from "@fenced/shared";

const frame = encodeServerEnvelope({ type: "session", payload: { id, createdAt: new Date().toISOString() } });
const parsed = parseClientEnvelope(rawMessage);
```
