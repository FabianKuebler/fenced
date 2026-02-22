# @fenced/skills

Skill discovery and runtime injection for the agent executor. Skills provide typed helpers and documentation that feed both the model prompt and the VM execution context.

## What it does
- `readSkillsPrompt` scans `src/skills/*/SKILL.md` plus `index.d.ts` to build a markdown section for each available skill (excluding test-only skills by default).
- `loadRuntimeSkills` dynamically imports skill implementations and returns an object ready to inject into the executor context.
- `isTestSkillsMode` toggles a deterministic test skill when `FENCED_TEST_SKILLS=1`, `NODE_ENV=test`, or `BUN_TESTING=1`.
- Built-in skills include Gmail access (`mail`) and a static `test-skill` for CI.

## Usage
```ts
import { loadRuntimeSkills, readSkillsPrompt } from "@fenced/skills";

const skills = await loadRuntimeSkills(); // { mail } or { test } in test mode
const skillsPrompt = await readSkillsPrompt(); // markdown appended to LLM system prompt
```
