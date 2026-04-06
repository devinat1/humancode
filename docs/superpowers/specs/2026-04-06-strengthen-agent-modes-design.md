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

  return [
    `<CRITICAL-INSTRUCTION priority="highest">`,
    agent.prompt,
    constraint ? `\nREMINDER — your non-negotiable constraint: ${constraint}` : '',
    `</CRITICAL-INSTRUCTION>`,
    '',
    BASE_OPERATIONS,
  ].filter(Boolean).join('\n')
}
```

`MODE_CONSTRAINTS` is a map of the single most important rule per native mode:

```typescript
const MODE_CONSTRAINTS: Record<string, string> = {
  pair: "You MUST NOT produce code blocks or use write/edit tools. You are an advisor only.",
  debug: "You MUST NOT write more than one logical step before debugging it.",
  vibe: "You MUST parse into discrete tasks and get confirmation before starting work.",
  claw: "You MUST work autonomously with no confirmations. Always self-review and test.",
  adaptive: "You MUST announce every mode transition and assess complexity per step.",
}
```

Applied at `llm.ts:73` — replaces direct `input.agent.prompt` usage with `wrapModePrompt(input.agent)`.

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

---

## 4. Restore Base Operational Instructions

Extract provider-agnostic operational instructions from `anthropic.txt` into a new `base-operations.txt`.

### What goes into `base-operations.txt`:
- Tone and style rules (concise, no emojis, markdown formatting)
- Professional objectivity
- Tool usage policy (dedicated tools over bash, parallel calls)
- Code reference formatting (`file_path:line_number`)
- System-reminder tag explanation

### What stays OUT:
- "You are OpenCode, the best coding agent..." — replaced by mode identity
- TodoWrite instructions — some modes don't use todos
- Task examples — modes define their own workflows
- "Doing tasks" section — too generic

### How it's injected:
Appended by `wrapModePrompt` AFTER the `</CRITICAL-INSTRUCTION>` block. This means:
- Mode prompt comes first inside the critical block (highest priority)
- Base operations come after, outside the critical block (lower priority)
- If they conflict, the critical block wins
- Custom user modes also get base operations (improvement over today)

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
| `packages/opencode/src/agent/mode-constraints.ts` | **New** — `MODE_CONSTRAINTS` map, imported by llm.ts and prompt.ts |
| `packages/opencode/src/session/llm.ts` | Add `wrapModePrompt`, use it at line 73 |
| `packages/opencode/src/session/prompt.ts` | Add periodic mode reminder injection after line 653 |
| `packages/opencode/test/agent/modes.test.ts` | Update tests for wrapper and reminder behavior |
