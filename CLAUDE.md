# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**fenced** — A prototype of an agentic chat runtime where markdown is the protocol.

The LLM streams markdown text, executes TypeScript code blocks server-side (`tsx agent.run`), and renders reactive UI components on the client—all within a single response. JSON can be streamed to named targets via `json agent.data` blocks.

**Core thesis:** Markdown is the ideal protocol for agentic AI. It's what LLMs already understand, mixing prose, executable code, and structured data without requiring new training.

Single-session, developer-only prototype with no sandboxing.

## Commands

```bash
# Install dependencies
bun install

# Development (run both in separate terminals)
bun run dev:server    # Bun API on port 4000
bun run dev:client    # Vite dev server with HMR

# Build
bun run build         # Build client then server

# Lint
bun run lint          # ESLint (client) + tsc --noEmit (server/packages)

# Tests
bun test                           # Run all tests
bun test packages/parser           # Run tests in specific package
bun test --watch                   # Watch mode
```

## Architecture

**Monorepo** using Bun workspaces with apps and packages:

```
apps/
  client/     # React + Vite frontend
  server/     # Bun HTTP/WebSocket API (entry: index.ts)
packages/
  shared/     # Protocol types, constants (API_PORT=4000)
  channel/    # WebSocketChannel - transport layer
  session/    # Session model (UUID, createdAt)
  runtime/    # Orchestrates interaction loop (user→LLM→parse→execute→logs→repeat)
  llm/        # OpenAI streaming via AI SDK, manages conversation history
  parser/     # Streaming markdown parser, extracts agent.run/agent.data blocks
  executor/   # VM execution (Bun transpiler + node:vm), Data proxy, mount manager
  skills/     # Skill discovery and injection (mail, test-skill)
  component-render/  # Client-side UI rendering with Valtio + output binders
```

**Data flow:**
1. User sends message via WebSocket → Server creates interaction
2. LLM generates markdown + `tsx agent.run` / `json agent.data` blocks
3. Parser extracts blocks, executor runs them in node:vm context
4. Runtime logs (console.*) trigger next model turn if non-empty
5. Mounts stream UI source + initial data to client for rendering

**Key patterns:**
- All WebSocket messages use typed envelopes (`@fenced/shared/protocol`)
- `Data` class uses Valtio proxies for reactive state mutations
- Code blocks share a single node:vm context per session (variables persist)
- `json agent.data => "<streamedDataId>"` streams JSON to `StreamedData` instances

## Package Conventions

- All packages expose through `src/index.ts`
- Import via `@fenced/*` workspace references
- Tests live in `src/__tests__/` directories

## Adding Skills

Skills live in `packages/skills/src/skills/<name>/` with three required files:
- `SKILL.md` - Description for LLM prompt (~10-20 lines)
- `index.d.ts` - TypeScript declarations shown to model
- `index.ts` - Runtime implementation injected as globals in agent.run

## Coding Standards

- TypeScript strict mode, 2-space indent
- Named exports for tree-shaking
- SCREAMING_SNAKE_CASE for constants, PascalCase for components, camelCase for helpers
- Conventional commits: `feat:`, `fix:`, `chore:`

## Environment

- `OPENAI_API_KEY` - Required for LLM provider
- `FENCED_TEST_SKILLS=1` or `BUN_TESTING=1` - Enable deterministic test skills
- API runs on port 4000, Vite proxies `/chat` WebSocket to it

## Documentation

- @SPEC.md

