# LLM-Based Assessor for Adaptive Mode

## Problem

The current assessor uses keyword matching and complexity scoring heuristics to pick a mode. It can't reason about intent or examine the codebase, leading to inaccurate mode selection for ambiguous prompts.

## Solution

Replace the heuristic assessor with a two-phase LLM-based assessor that runs as a pre-flight hook in `SessionPrompt.prompt()`. It only activates when the user is in adaptive mode.

## Design

### Hook Location

In `SessionPrompt.prompt()` (prompt.ts), before `createUserMessage()`:

1. Check if `input.agent === "adaptive"`
2. If yes, run the two-phase assessment
3. Overwrite `input.agent` with the resolved concrete mode
4. Proceed normally — `createUserMessage()` bakes in the resolved mode

### Phase 1: Quick Classify

- Uses `generateObject` from the Vercel AI SDK
- Uses the user's currently selected model (`input.model`)
- System prompt describes the 4 concrete modes (pair, debug, vibe, claw) with their purpose and constraints
- Input: the user's prompt text (extracted from `input.parts`)
- Output schema: `{ mode: "pair" | "debug" | "vibe" | "claw", confidence: number, reason: string }`
- If `confidence >= 80`, use the mode immediately — skip Phase 2

### Phase 2: Explore & Decide

Only runs when Phase 1 confidence < 80.

- Uses `streamText` with tool access: `read`, `glob`, `grep`
- Capped at 10 tool-call steps to bound latency
- The agent explores files relevant to the user's prompt, then returns a final mode decision
- Final decision extracted from the last text response via a structured format or a second `generateObject` call

### Assessor System Prompt

Describes each mode concisely:

- **pair**: Guidance and explanation. Never writes code. For learning-oriented prompts ("explain", "why does", "how does").
- **debug**: Step-by-step with live debugging. One logical step at a time. For complex/risky changes, refactors, untested code.
- **vibe**: Multi-task manager. Parses tasks, confirms plan, works through them with self-review. For moderate multi-step work.
- **claw**: Fully autonomous. No confirmations, self-reviews, tests. For straightforward mechanical tasks (renames, config, boilerplate).

Asks: "Given this user prompt, which mode fits best? If you're unsure, say so with low confidence and explain what you'd need to look at."

For Phase 2, the prompt adds: "You can now explore the codebase to make a more informed decision. Look at relevant files, then decide."

### Files Changed

1. **`packages/opencode/src/agent/assessor.ts`** — Replace heuristic `analyze()` with async `assess()` that implements the two-phase flow
2. **`packages/opencode/src/session/prompt.ts`** — Add pre-flight hook in `prompt()` before `createUserMessage()`
3. **`packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`** — Remove the client-side assessor call (already done); just send `agent: "adaptive"` to the server
4. **`packages/opencode/src/agent/prompt/assessor.txt`** — New prompt file for the assessor system prompt

### What Doesn't Change

- Agent definitions, mode-constraints, mode prompts — all unchanged
- The main loop, processor, LLM stream — unchanged
- The TUI prompt submission flow — simplified (no more client-side assessment)
