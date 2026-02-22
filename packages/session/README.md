# @fenced/session

Minimal session model for WebSocket connections. Each session carries a unique id and creation timestamp so runtime channels can tag outgoing envelopes.

## What it does
- Generates a UUID when no `id` is provided.
- Records `createdAt` on construction for inclusion in `SessionPayload`.
- Serves as the context object passed into channel/socket handlers.

## Usage
```ts
import { Session } from "@fenced/session";

const session = new Session();
console.log(session.id, session.createdAt.toISOString());
```
