# @fenced/parser

Streaming markdown parser that separates plain text from executable agent blocks. Designed for LLM responses that mix narrative content with `agent.run`/`agent.data` fences.

## What it does
- Consumes an `AsyncIterable<{ text: string }>` and yields `ParserSegment` objects.
- Detects ```tsx agent.run``` blocks and returns their source with block indices.
- Detects ```json agent.data => "<streamedDataId>"``` blocks and streams their JSON payloads.
- Treats everything else as markdown, streaming tokens incrementally to avoid buffering.

## Usage
```ts
import { parse } from "@fenced/parser";

for await (const segment of parse(llmStream)) {
  if (segment.kind === "agent_run") {
    await executor.run(segment.source);
  }
}
```
