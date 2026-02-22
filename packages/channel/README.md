# @fenced/channel

WebSocket transport for the agent runtime. `WebSocketChannel` wraps Bun `ServerWebSocket` instances and speaks the `@fenced/shared` protocol to stream assistant output, UI mounts, and client submissions.

## What it does
- Sends session, assistant message, markdown, JSON data, mount, data patch, and log envelopes to the browser.
- Parses incoming client envelopes and resolves `ui_submit` payloads back to pending mounts.
- Buffers mount results via `mountId` so the caller can await UI submissions.
- Guards against closed sockets and malformed frames to keep the runtime stable.

## Usage
```ts
import type { ServerWebSocket } from "bun";
import { Session } from "@fenced/session";
import { WebSocketChannel } from "@fenced/channel";

const session = new Session();
const channel = new WebSocketChannel(ws as ServerWebSocket, session, { schemaVersion: 1 });

channel.sendSession({ capabilities: { markdown_stream: true } });
channel.sendMarkdown({ interactionId, messageId }, markdownChunks);
channel.sendMount({ mountId: "panel", uiSource, initialData: {}, outputSchemaShape: {} });
```
