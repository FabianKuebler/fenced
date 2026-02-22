# @fenced/llm

Thin wrapper around streaming chat providers. It builds a system prompt from the base runtime prompt plus skill docs, maintains message history, and yields text chunks for each assistant turn.

## What it does
- `Llm` manages conversation state and streams responses via a pluggable `LlmProvider`.
- Composes the system prompt from `PROMPT.md`, the skills prompt (from `@fenced/skills`), and optional extras.
- Supports two entry points per turn: `userQuery(text)` for user input and `logs(payload)` to feed runtime transcripts back into the model.
- `createDefaultLlm` boots an OpenAI provider (defaults to `gpt-5-mini`) and reads `OPENAI_API_KEY`, throwing `MissingApiKeyError` when unset.

## Usage
```ts
import { createDefaultLlm } from "@fenced/llm";

const llm = await createDefaultLlm({ model: "gpt-4o-mini" });
const stream = llm.userQuery("Summarize the runtime protocol.");

for await (const chunk of stream) {
  process.stdout.write(chunk.text);
}
```
