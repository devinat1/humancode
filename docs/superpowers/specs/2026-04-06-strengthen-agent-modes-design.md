# Strengthen Agent Modes

## Problem

All 5 primary agent modes (Pair, Debug, Vibe, Claw, Adaptive) behave too similarly. The LLM ignores mode-specific behavioral instructions — Pair mode writes code, Debug mode skips the debugger workflow, etc.

**Root cause:** Mode prompts are short (11-31 lines), use soft language, fire once with no reinforcement, and replace the base operational prompt entirely (losing useful instructions).

## Solution

Four coordinated changes: rewrite prompts, add a structural wrapper, add periodic reminders, and restore shared operational instructions.

---

## 1. Prompt Rewrites

Rewrite all 5 mode prompt files in `packages/opencode/src/agent/prompt/`.

Each prompt follows this structure:

```
<IDENTITY>
You are OpenCode in {MODE} mode. {One-sentence identity.}
</IDENTITY>

<HARD-CONSTRAINTS>
These rules are absolute. Violating any of them is a critical failure.
- CONSTRAINT 1
- CONSTRAINT 2
...
</HARD-CONSTRAINTS>

<WORKFLOW>
{Step-by-step workflow — same content as today but tightened}
</WORKFLOW>

<SELF-CHECK>
Before EVERY response, verify:
- [ ] Am I following constraint 1?
- [ ] Am I following constraint 2?
If you catch yourself violating a constraint, STOP and correct immediately.
</SELF-CHECK>

<EXAMPLES>
CORRECT: {example of correct behavior}
WRONG: {example of what NOT to do}
</EXAMPLES>
```

### Per-mode hard constraints

| Mode | Hard Constraints |
|------|-----------------|
| **Pair** | NEVER produce code blocks. NEVER use write/edit tools. Only pseudocode, signatures, hints. |
| **Debug** | NEVER write more than one logical step before debugging it. ALWAYS use the debugger. STOP and wait for user at each breakpoint. |
| **Vibe** | ALWAYS parse into discrete tasks first. ALWAYS run review sub-agent after each task. NEVER skip the task list confirmation. |
| **Claw** | ALWAYS work autonomously — no asking for confirmation. ALWAYS self-review via review sub-agent. ALWAYS run tests. |
| **Adaptive** | ALWAYS assess complexity per-step. ALWAYS announce mode transitions. NEVER silently change behavior. |

---

## 2. Mode Wrapper in `llm.ts`

Add a `wrapModePrompt` function that wraps any agent prompt with priority framing before it enters the system array.

```typescript
function wrapModePrompt(agent: Agent.Info): string | undefined {
  if (!agent.prompt) return undefined

  const constraint = MODE_CONSTRAINTS[agent.name]

  // Only wrap primary, visible modes. Subagents (explore, review),
  // hidden agents (compaction, title, summary), and the legacy build/plan
  // agents keep their prompts unwrapped.
  if (!constraint) return agent.prompt

  return [
    `<CRITICAL-INSTRUCTION priority="highest">`,
    agent.prompt,
    `\nREMINDER — your non-negotiable constraint: ${constraint}`,
    `</CRITICAL-INSTRUCTION>`,
    '',
    BASE_OPERATIONS,
  ].filter(Boolean).join('\n')
}
```

**Gate:** The wrapper only applies when `MODE_CONSTRAINTS[agent.name]` exists — i.e., the five native primary modes. All other agents (subagents like explore/review, hidden agents like compaction/title/summary, legacy agents like build/plan, and custom user agents) get their prompt passed through unchanged. This prevents injecting `BASE_OPERATIONS` and `<CRITICAL-INSTRUCTION>` tags into agents where they don't belong (e.g., a title generator or context compactor).

**User-overridden prompts:** If a user overrides a native mode's prompt via config (e.g., `agent.pair.prompt = "my custom prompt"`), the wrapper still applies because the agent name is still `pair`. The constraint reminds the LLM of the mode's core rule even with a custom prompt. This is intentional — if the user wants a completely unconstrained agent, they should create a new custom agent rather than overriding a native mode's prompt.

`MODE_CONSTRAINTS` is a map of the single most important rule per native mode:

```typescript
export const MODE_CONSTRAINTS: Record<string, string> = {
  pair: "You MUST NOT produce code blocks or use write/edit tools. You are an advisor only.",
  debug: "You MUST NOT write more than one logical step before debugging it.",
  vibe: "You MUST parse into discrete tasks, get confirmation, and run the review sub-agent after each task.",
  claw: "You MUST work autonomously with no confirmations. Always self-review and test.",
  adaptive: "You MUST announce every mode transition and assess complexity per step.",
}
```

Applied at `llm.ts:73` — replaces direct `input.agent.prompt` usage with `wrapModePrompt(input.agent)`.

**Codex sessions:** When `isCodex` is true and no agent prompt exists, `SystemPrompt.provider()` is already skipped (existing behavior). When an agent prompt does exist, `wrapModePrompt` returns the wrapped prompt. Codex sessions already receive separate `options.instructions` via `SystemPrompt.instructions()`. The `BASE_OPERATIONS` content is complementary (tone, tool policy) and does not conflict with the Codex header instructions.

---

## 3. Periodic Mode Reminders in `prompt.ts`

Inject a mode-reinforcement system message every 5 assistant turns to prevent drift.

After `prompt.ts:653` (system array assembly):

```typescript
const assistantCount = sessionMessages.filter(m => m.info.role === "assistant").length
const REMINDER_INTERVAL = 5

if (assistantCount > 0 && assistantCount % REMINDER_INTERVAL === 0 && agent.prompt) {
  const constraint = MODE_CONSTRAINTS[agent.name]
  if (constraint) {
    system.push([
      `<system-reminder>`,
      `MODE REMINDER: You are in ${agent.name} mode. ${constraint}`,
      `If your recent behavior has drifted from this, correct immediately.`,
      `</system-reminder>`,
    ].join('\n'))
  }
}
```

Key decisions:
- Interval of 5 — frequent enough to prevent drift, not wasteful on tokens
- Only fires for agents with a constraint entry (native modes)
- Uses existing `<system-reminder>` convention the codebase already uses
- Placed in `prompt.ts` (has access to message history) not `llm.ts`
- After compaction, assistant count resets (compacted messages are removed from `sessionMessages`). This means the reminder interval resets too. Accepted limitation — compaction already disrupts context, so a fresh reminder cycle is appropriate.
- Does not conflict with existing plan-mode reminders (`insertReminders` in `prompt.ts`) — plan reminders inject plan-file instructions, mode reminders inject behavioral constraints. They address different concerns and can coexist.

---

## 4. Restore Base Operational Instructions

Extract provider-agnostic operational instructions from `anthropic.txt` into a new `base-operations.txt`.

### Content of `base-operations.txt` (line-level extraction from `anthropic.txt`)

**INCLUDED — universal operational instructions:**

```
# Tone and style
- Only use emojis if the user explicitly requests it.
- Your output will be displayed on a command line interface. Your responses
  should be short and concise. You can use GitHub-flavored markdown for
  formatting, and will be rendered in a monospace font using the CommonMark
  specification.
- Output text to communicate with the user; all text you output outside of
  tool use is displayed to the user. Only use tools to complete tasks. Never
  use tools like Bash or code comments as means to communicate with the user
  during the session.
- NEVER create files unless they're absolutely necessary for achieving your
  goal. ALWAYS prefer editing an existing file to creating a new one.

# Professional objectivity
Prioritize technical accuracy and truthfulness over validating the user's
beliefs. Focus on facts and problem-solving, providing direct, objective
technical info without any unnecessary superlatives, praise, or emotional
validation.

# Tool usage policy
- Use specialized tools instead of bash commands when possible, as this
  provides a better user experience. For file operations, use dedicated tools:
  Read for reading files instead of cat/head/tail, Edit for editing instead of
  sed/awk, and Write for creating files instead of cat with heredoc or echo
  redirection. Reserve bash tools exclusively for actual system commands and
  terminal operations that require shell execution.
- You can call multiple tools in a single response. If you intend to call
  multiple tools and there are no dependencies between them, make all
  independent tool calls in parallel.
- When WebFetch returns a message about a redirect to a different host, you
  should immediately make a new WebFetch request with the redirect URL.

# System tags
- Tool results and user messages may include <system-reminder> tags.
  <system-reminder> tags contain useful information and reminders. They are
  automatically added by the system, and bear no direct relation to the
  specific tool results or user messages in which they appear.

# Code references
When referencing specific functions or pieces of code include the pattern
`file_path:line_number` to allow the user to easily navigate to the source
code location.
```

**EXCLUDED — mode-specific or redundant:**

| Section from `anthropic.txt` | Reason excluded |
|-----|------|
| "You are OpenCode, the best coding agent..." (line 1) | Replaced by mode-specific identity |
| Task Management / TodoWrite (lines 23-67) | Not all modes use todos; modes define their own workflows. The "IMPORTANT: Always use the TodoWrite tool" directive would conflict with Pair mode. |
| "Doing tasks" (lines 70-76) | Too generic; modes define their own task approach |
| Task tool usage in "Tool usage policy" (lines 79-80, 86-96) | References Task tool for exploration which is a workflow choice, not an operational instruction. The TodoWrite reminder on line 96 is excluded per above. |
| OpenCode docs WebFetch instruction (line 12) | Product-specific, not operational |

### How it's injected:
Appended by `wrapModePrompt` AFTER the `</CRITICAL-INSTRUCTION>` block. This means:
- Mode prompt comes first inside the critical block (highest priority)
- Base operations come after, outside the critical block (lower priority)
- If they conflict, the critical block wins
- Only injected for the 5 native primary modes (same gate as the wrapper)

### Resulting system prompt order

The final system prompt seen by the LLM is assembled across `llm.ts` and `prompt.ts`:

1. **`<CRITICAL-INSTRUCTION>` block** — mode identity, workflow, constraints, self-check (from `wrapModePrompt` in `llm.ts`)
2. **`BASE_OPERATIONS`** — shared tone/tool/formatting rules (from `wrapModePrompt` in `llm.ts`)
3. **Environment info** — working directory, platform, date (from `SystemPrompt.environment` in `prompt.ts`)
4. **Instruction files** — AGENTS.md, CLAUDE.md content (from `InstructionPrompt.system` in `prompt.ts`)
5. **Periodic mode reminder** — constraint re-injection every 5 turns (from `prompt.ts`, when interval fires)
6. **User system prompt** — per-message user system content (from `input.user.system` in `llm.ts`)

---

## Files Changed

| File | Change |
|------|--------|
| `packages/opencode/src/agent/prompt/pair.txt` | Rewrite with strong identity, hard gates, self-check, examples |
| `packages/opencode/src/agent/prompt/debug.txt` | Same |
| `packages/opencode/src/agent/prompt/vibe.txt` | Same |
| `packages/opencode/src/agent/prompt/claw.txt` | Same |
| `packages/opencode/src/agent/prompt/adaptive.txt` | Same |
| `packages/opencode/src/agent/prompt/base-operations.txt` | **New** — shared operational instructions extracted from anthropic.txt |
| `packages/opencode/src/agent/mode-constraints.ts` | **New** — `MODE_CONSTRAINTS` map, exported and imported by llm.ts and prompt.ts |
| `packages/opencode/src/session/llm.ts` | Add `wrapModePrompt`, use it at line 73 |
| `packages/opencode/src/session/prompt.ts` | Add periodic mode reminder injection after line 653 |
| `packages/opencode/test/agent/modes.test.ts` | Update tests for wrapper and reminder behavior |
