# Socratic Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `debug` primary agent with a new `socratic` primary agent that guides users to discover code behavior through one-question-one-breakpoint dialog; remove the `build` and `plan` primary agents; make `socratic` the new default.

**Architecture:** New 5-phase machine (`PLANNING → HYPOTHESIS → SOCRATIC → SUMMARIZING → CONFIRMING`) replaces the existing 6-phase debug machine. The SOCRATIC phase is a single phase that loops internally with a hard "one breakpoint live at a time" rule. The debugger MCP server in `packages/debugger` is unchanged — only the opencode-side agent prompt, phase machine, and registration change.

**Tech Stack:** TypeScript, Bun (test runner), Zod, the MCP `@modelcontextprotocol/sdk`. Existing debugger MCP tools (`debugger_set_breakpoints`, `debugger_continue_execution`, etc.) are reused as-is.

**Spec:** [docs/superpowers/specs/2026-05-19-socratic-agent-design.md](../specs/2026-05-19-socratic-agent-design.md)

---

## File Map

**Files to create:**
- `packages/opencode/src/session/socratic-phase.ts` — new phase machine.
- `packages/opencode/src/agent/prompt/socratic.txt` — new agent prompt.
- `packages/opencode/test/session/socratic-phase.test.ts` — tests for the phase machine.

**Files to modify:**
- `packages/opencode/src/agent/agent.ts` — remove `debug`, `build`, `plan` agent registrations; add `socratic`; update `MODE_ORDER`; update `defaultAgent()`.
- `packages/opencode/src/tool/transition-phase.ts` — switch from `DebugPhase` to `SocraticPhase`; update description and phase enum.
- `packages/opencode/src/session/processor.ts` — update import from `debug-phase` to `socratic-phase`; rename function calls.
- `packages/opencode/src/session/llm.ts` — same.
- `packages/opencode/src/agent/mode-constraints.ts` — replace `debug` entry with `socratic`.
- `packages/opencode/test/tool/transition-phase.test.ts` — update for new phase set and agent name.
- `packages/opencode/test/agent/modes.test.ts` — assert new agent set and that `socratic` is default.

**Files to delete (at the end, after all references gone):**
- `packages/opencode/src/agent/prompt/debug.txt`
- `packages/opencode/src/session/debug-phase.ts`
- `packages/opencode/test/session/debug-phase.test.ts`

**Documentation to update (last):**
- `packages/web/src/content/docs/modes.mdx` and translations.
- Any `README.md` / `AGENTS.md` references.

---

## Task 1: Create `socratic-phase.ts` with tests

**Files:**
- Create: `packages/opencode/src/session/socratic-phase.ts`
- Test: `packages/opencode/test/session/socratic-phase.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `packages/opencode/test/session/socratic-phase.test.ts`:

```typescript
import { describe, expect, test } from "bun:test"
import { SocraticPhase } from "../../src/session/socratic-phase"

describe("SocraticPhase.create", () => {
  test("returns PLANNING phase, step 0, null totalSteps, false autoConfirm", () => {
    const state = SocraticPhase.create("test-session-1")
    expect(state.sessionID).toBe("test-session-1")
    expect(state.currentPhase).toBe("PLANNING")
    expect(state.currentStep).toBe(0)
    expect(state.totalSteps).toBeNull()
    expect(state.autoConfirm).toBe(false)
    expect(state.stepDescriptions).toEqual([])
  })
})

describe("SocraticPhase.transition", () => {
  test("valid path with HYPOTHESIS: PLANNING -> HYPOTHESIS -> SOCRATIC", () => {
    const state = SocraticPhase.create("test-hypo")
    const afterHypo = SocraticPhase.transition(state, "HYPOTHESIS")
    expect(afterHypo.currentPhase).toBe("HYPOTHESIS")
    const afterSoc = SocraticPhase.transition(afterHypo, "SOCRATIC")
    expect(afterSoc.currentPhase).toBe("SOCRATIC")
  })

  test("valid path skipping HYPOTHESIS: PLANNING -> SOCRATIC", () => {
    const state = SocraticPhase.create("test-skip-hypo")
    const afterSoc = SocraticPhase.transition(state, "SOCRATIC")
    expect(afterSoc.currentPhase).toBe("SOCRATIC")
  })

  test("full cycle back to PLANNING", () => {
    let state = SocraticPhase.create("test-cycle")
    state = SocraticPhase.transition(state, "HYPOTHESIS")
    state = SocraticPhase.transition(state, "SOCRATIC")
    state = SocraticPhase.transition(state, "SUMMARIZING")
    state = SocraticPhase.transition(state, "CONFIRMING")
    state = SocraticPhase.transition(state, "PLANNING")
    expect(state.currentPhase).toBe("PLANNING")
  })

  test("step increments on CONFIRMING -> PLANNING", () => {
    let state = SocraticPhase.create("test-step-inc")
    expect(state.currentStep).toBe(0)
    state = SocraticPhase.transition(state, "SOCRATIC")
    state = SocraticPhase.transition(state, "SUMMARIZING")
    state = SocraticPhase.transition(state, "CONFIRMING")
    expect(state.currentStep).toBe(0)
    state = SocraticPhase.transition(state, "PLANNING")
    expect(state.currentStep).toBe(1)
  })

  test("invalid transitions throw with descriptive message", () => {
    const state = SocraticPhase.create("test-invalid")
    expect(() => SocraticPhase.transition(state, "SUMMARIZING")).toThrow(
      /cannot transition from PLANNING to SUMMARIZING/i,
    )
    expect(() => SocraticPhase.transition(state, "CONFIRMING")).toThrow(
      /cannot transition from PLANNING to CONFIRMING/i,
    )
  })

  test("SUMMARIZING is reachable only from SOCRATIC", () => {
    let s = SocraticPhase.create("test-sum-only")
    s = SocraticPhase.transition(s, "HYPOTHESIS")
    expect(() => SocraticPhase.transition(s, "SUMMARIZING")).toThrow()
  })
})

describe("SocraticPhase.toolsForPhase", () => {
  test("returns correct tools for each phase", () => {
    expect(SocraticPhase.toolsForPhase("PLANNING")).toEqual([
      "read",
      "glob",
      "grep",
      "task",
      "transitionPhase",
    ])
    expect(SocraticPhase.toolsForPhase("HYPOTHESIS")).toEqual([
      "read",
      "transitionPhase",
    ])
    expect(SocraticPhase.toolsForPhase("SOCRATIC")).toEqual([
      "debugger_set_breakpoints",
      "debugger_remove_breakpoints",
      "debugger_list_breakpoints",
      "debugger_start_debug_session",
      "debugger_continue_execution",
      "debugger_step_over",
      "debugger_step_into",
      "debugger_step_out",
      "debugger_get_variables",
      "debugger_get_call_stack",
      "debugger_evaluate_expression",
      "read",
      "transitionPhase",
    ])
    expect(SocraticPhase.toolsForPhase("SUMMARIZING")).toEqual(["transitionPhase"])
    expect(SocraticPhase.toolsForPhase("CONFIRMING")).toEqual([
      "debugger_stop_debug_session",
      "transitionPhase",
    ])
  })
})

describe("SocraticPhase.isSocraticAgent", () => {
  test("returns true for 'socratic', false for others", () => {
    expect(SocraticPhase.isSocraticAgent("socratic")).toBe(true)
    expect(SocraticPhase.isSocraticAgent("debug")).toBe(false)
    expect(SocraticPhase.isSocraticAgent("Socratic")).toBe(false)
    expect(SocraticPhase.isSocraticAgent("")).toBe(false)
  })
})

describe("SocraticPhase.isToolAllowed", () => {
  test("returns correct boolean", () => {
    expect(SocraticPhase.isToolAllowed("PLANNING", "read")).toBe(true)
    expect(SocraticPhase.isToolAllowed("PLANNING", "edit")).toBe(false)
    expect(SocraticPhase.isToolAllowed("HYPOTHESIS", "read")).toBe(true)
    expect(SocraticPhase.isToolAllowed("HYPOTHESIS", "debugger_set_breakpoints")).toBe(false)
    expect(SocraticPhase.isToolAllowed("SOCRATIC", "debugger_set_breakpoints")).toBe(true)
    expect(SocraticPhase.isToolAllowed("SOCRATIC", "edit")).toBe(false)
    expect(SocraticPhase.isToolAllowed("SUMMARIZING", "read")).toBe(false)
    expect(SocraticPhase.isToolAllowed("SUMMARIZING", "transitionPhase")).toBe(true)
    expect(SocraticPhase.isToolAllowed("CONFIRMING", "debugger_stop_debug_session")).toBe(true)
  })
})

describe("SocraticPhase storage functions", () => {
  test("get returns undefined for unknown session", () => {
    expect(SocraticPhase.get("nonexistent-session")).toBeUndefined()
  })

  test("getOrCreate returns existing or creates new", () => {
    const id = "test-get-or-create-soc"
    SocraticPhase.clear(id)
    const state1 = SocraticPhase.getOrCreate(id)
    expect(state1.currentPhase).toBe("PLANNING")

    SocraticPhase.transition(state1, "HYPOTHESIS")
    const state2 = SocraticPhase.getOrCreate(id)
    expect(state2.currentPhase).toBe("HYPOTHESIS")
  })

  test("clear removes state", () => {
    const id = "test-clear-soc"
    SocraticPhase.create(id)
    expect(SocraticPhase.get(id)).toBeDefined()
    SocraticPhase.clear(id)
    expect(SocraticPhase.get(id)).toBeUndefined()
  })

  test("setAutoConfirm toggles auto-confirm", () => {
    const id = "test-auto-soc"
    SocraticPhase.create(id)
    expect(SocraticPhase.get(id)!.autoConfirm).toBe(false)
    SocraticPhase.setAutoConfirm(id, true)
    expect(SocraticPhase.get(id)!.autoConfirm).toBe(true)
    SocraticPhase.setAutoConfirm(id, false)
    expect(SocraticPhase.get(id)!.autoConfirm).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails (no implementation yet)**

Run: `cd packages/opencode && bun test test/session/socratic-phase.test.ts`
Expected: FAIL with "Cannot find module '../../src/session/socratic-phase'" or similar import error.

- [ ] **Step 3: Implement `socratic-phase.ts`**

Create `packages/opencode/src/session/socratic-phase.ts`:

```typescript
export namespace SocraticPhase {
  export const PHASES = [
    "PLANNING",
    "HYPOTHESIS",
    "SOCRATIC",
    "SUMMARIZING",
    "CONFIRMING",
  ] as const

  export type Phase = (typeof PHASES)[number]

  export interface State {
    sessionID: string
    currentPhase: Phase
    currentStep: number
    totalSteps: number | null
    stepDescriptions: string[]
    autoConfirm: boolean
  }

  const VALID_TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
    PLANNING: ["HYPOTHESIS", "SOCRATIC"],
    HYPOTHESIS: ["SOCRATIC"],
    SOCRATIC: ["SUMMARIZING"],
    SUMMARIZING: ["CONFIRMING"],
    CONFIRMING: ["PLANNING"],
  }

  const PHASE_TOOLS: Readonly<Record<Phase, readonly string[]>> = {
    PLANNING: ["read", "glob", "grep", "task", "transitionPhase"],
    HYPOTHESIS: ["read", "transitionPhase"],
    SOCRATIC: [
      "debugger_set_breakpoints",
      "debugger_remove_breakpoints",
      "debugger_list_breakpoints",
      "debugger_start_debug_session",
      "debugger_continue_execution",
      "debugger_step_over",
      "debugger_step_into",
      "debugger_step_out",
      "debugger_get_variables",
      "debugger_get_call_stack",
      "debugger_evaluate_expression",
      "read",
      "transitionPhase",
    ],
    SUMMARIZING: ["transitionPhase"],
    CONFIRMING: ["debugger_stop_debug_session", "transitionPhase"],
  }

  const store = new Map<string, State>()

  export function create(sessionID: string): State {
    const state: State = {
      sessionID,
      currentPhase: "PLANNING",
      currentStep: 0,
      totalSteps: null,
      stepDescriptions: [],
      autoConfirm: false,
    }
    store.set(sessionID, state)
    return state
  }

  export function get(sessionID: string): State | undefined {
    return store.get(sessionID)
  }

  export function getOrCreate(sessionID: string): State {
    return store.get(sessionID) ?? create(sessionID)
  }

  export function transition(state: State, to: Phase): State {
    const allowed = VALID_TRANSITIONS[state.currentPhase]
    if (!allowed.includes(to)) {
      throw new Error(
        `Cannot transition from ${state.currentPhase} to ${to}. Valid transitions: ${allowed.join(", ")}`,
      )
    }

    let nextStep = state.currentStep
    if (state.currentPhase === "CONFIRMING" && to === "PLANNING") {
      nextStep = state.currentStep + 1
    }

    const next: State = {
      ...state,
      currentPhase: to,
      currentStep: nextStep,
    }
    store.set(state.sessionID, next)
    return next
  }

  export function toolsForPhase(phase: Phase): string[] {
    return [...PHASE_TOOLS[phase]]
  }

  export function isSocraticAgent(agentName: string): boolean {
    return agentName === "socratic"
  }

  export function isToolAllowed(phase: Phase, toolID: string): boolean {
    return PHASE_TOOLS[phase].includes(toolID)
  }

  export function setAutoConfirm(sessionID: string, value: boolean): void {
    const state = store.get(sessionID)
    if (state) {
      store.set(sessionID, { ...state, autoConfirm: value })
    }
  }

  export function clear(sessionID: string): void {
    store.delete(sessionID)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/opencode && bun test test/session/socratic-phase.test.ts`
Expected: PASS — all describes and tests green.

- [ ] **Step 5: Run the whole test suite to confirm nothing else broke**

Run: `cd packages/opencode && bun test`
Expected: All tests pass. (Note: `debug-phase.test.ts` is still there and still passing.)

- [ ] **Step 6: Commit**

```bash
git add packages/opencode/src/session/socratic-phase.ts packages/opencode/test/session/socratic-phase.test.ts
git commit -m "feat(socratic): add SocraticPhase namespace with 5-phase machine"
```

---

## Task 2: Create the `socratic.txt` agent prompt

**Files:**
- Create: `packages/opencode/src/agent/prompt/socratic.txt`

- [ ] **Step 1: Write the prompt file**

Create `packages/opencode/src/agent/prompt/socratic.txt`:

```
<IDENTITY>
You are OpenCode in SOCRATIC mode. You guide users to discover how code works by asking ONE question at a time, paired with exactly ONE breakpoint per question. You NEVER answer the question for the user. Your job is to lead them to the answer through targeted observations of live program state.
</IDENTITY>

<HARD-CONSTRAINTS>
These rules are absolute. Violating any of them is a critical failure.
1. Never have more than ONE breakpoint live at a time during SOCRATIC. Before setting a new breakpoint, remove the previous one (or confirm via `debugger_list_breakpoints` that none remain).
2. Ask exactly ONE question per loop iteration. Never batch questions.
3. After asking a PREDICT-style question, STOP. Do not call any other tool until the user responds.
4. Use `transitionPhase` to move between phases. SUMMARIZING is not skippable.
5. If the user says "done", "I get it", "stop", or "end" at any time, immediately transition to SUMMARIZING. ("Next" is reserved for the agent's own internal loop progression and is NOT a user signal.)
6. Do NOT write or modify any source code. SOCRATIC is read-only with respect to source files.
</HARD-CONSTRAINTS>

<WORKFLOW>
You operate in strict phases. Use the `transitionPhase` tool to move between them.

### PLANNING
Read the relevant code. Identify the slice (function, route, flow) to investigate. Pick an entry point. Sketch a question arc (for yourself, not the user).
- If the user's opening message clearly states their hypothesis or a specific question, call `transitionPhase({ to: "SOCRATIC", reason: "..." })` and skip HYPOTHESIS.
- Otherwise call `transitionPhase({ to: "HYPOTHESIS", reason: "..." })`.

### HYPOTHESIS
Ask the user 1-2 short questions to surface their current mental model: "what do you think happens here?" or "where do you expect the issue lives?" Keep it tight. After their answer, call `transitionPhase({ to: "SOCRATIC", reason: "..." })`.

### SOCRATIC
The core loop. Repeat until execution reaches the natural endpoint of the slice OR the user says done.

For each iteration:
1. Read code if needed to decide the next question and the line whose execution will answer it.
2. Choose PREDICT or OBSERVE based on the question's nature:
   - **PREDICT** (question about upcoming behavior): Ask the question first. WAIT for the user's answer. Then set ONE breakpoint, start or continue execution, get variables/stack, reveal the actual value, give feedback comparing prediction vs reality.
   - **OBSERVE** (question about prior state): Set ONE breakpoint, advance, get variables/stack, then ask "what does this tell you about [X]?" and WAIT for the user's reasoning.
3. After the user has responded (and you've revealed the answer in PREDICT mode), remove the breakpoint just visited. Return to step 1 with the next question.

Build questions from FIRST PRINCIPLES — types, values, control flow, invariants — not from leading or rhetorical phrasing. Examples:
- "Given input `email = 'a+b@x.com'`, what type is `req.body.email` at this point?"
- "Which branch will the conditional take here, given `user.role === 'admin'`?"
- "What value must `tokens.length` be for the loop body to execute?"

When the user gives a wrong prediction:
- Acknowledge briefly.
- Show the actual value.
- Ask ONE follow-up that probes the gap ("what would have to be different for your prediction to be right?").
- Do not lecture. Do not pile on hints. Move on.

Loop ends when:
- Execution reaches the natural endpoint of the slice (the function under examination returns, an HTTP response is sent, the call stack pops past the entry frame you picked in PLANNING, or the program exits), OR
- The user says "done", "I get it", "stop", or "end".

Call `transitionPhase({ to: "SUMMARIZING", reason: "..." })`.

### SUMMARIZING
Use NO tools — just narrate. Recap in plain language:
- Which of the user's hypotheses matched reality.
- Which hypotheses mismatched, and why.
- The key invariants the user discovered.
Call `transitionPhase({ to: "CONFIRMING", reason: "..." })`.

### CONFIRMING
Use `debugger_stop_debug_session` if any debug session is still running.
Ask: "Want to go deeper into another slice, switch agents, or end here?"
Wait for the user. When they want to continue, call `transitionPhase({ to: "PLANNING", reason: "Moving to next slice" })`.
</WORKFLOW>

<LANGUAGE-NOTES>
## TypeScript / JavaScript
- Debug type "node" — launches with `--inspect-brk`
- For custom runtimes (bun, tsx, deno), pass `runtimeExecutable`
- For async/await: set breakpoints INSIDE `.then()` or after `await`, not on the `await` line
- For Express/Fastify: breakpoints inside route handlers, not on `app.get()` registration
- For React: breakpoints in event handlers and `useEffect` callbacks, not in JSX return

## Python
- Debug type "python" — uses debugpy's DAP server
- Requires `debugpy`: `pip install debugpy`
- For modules, use `module` parameter instead of `program`
- For custom Python paths, use `pythonPath` parameter

## Go
- Debug type "go" — uses Delve's DAP server
- Requires `dlv` on PATH
- For modules with multiple binaries, point `program` at the directory containing `main.go`
</LANGUAGE-NOTES>

<SELF-CHECK>
Before EVERY response, verify:
- [ ] Is there at most one breakpoint live right now? If more, STOP and remove extras.
- [ ] Am I about to ask more than one question? If yes, split.
- [ ] In PREDICT mode, am I about to call another tool without waiting for the user? STOP.
- [ ] Did I use `transitionPhase` to move phases? If no, STOP and call it.
- [ ] Am I about to edit or write source code? STOP — SOCRATIC is read-only.
If you catch yourself violating a constraint, STOP immediately and correct.
</SELF-CHECK>

<EXAMPLES>
CORRECT (predict-first):
User: "Help me understand how this regex validator works"
[PLANNING] Reads validator code. Sees regex compilation, then a match call.
[HYPOTHESIS] "Before we step through it — what do you think the regex matches? Just a rough description."
User: "Looks like it matches email addresses."
[SOCRATIC]
Q1 (PREDICT): "Given input `'a+b@x.com'`, do you think this regex will match? Yes or no, and why?"
[WAIT for answer]
User: "Yes."
Sets one breakpoint after the match call. Continues. Gets variables.
"Actually it returns false. The character class `[a-z0-9]` excludes `+`. What would have to change for your prediction to be right?"

CORRECT (observe-first):
[SOCRATIC]
Q1 (OBSERVE): Sets one breakpoint at function entry. Continues. Gets variables.
"OK we're stopped here. `req.body.email` is `undefined`. What does that tell you about the request that came in?"
[WAIT for answer]

WRONG:
[SOCRATIC] Sets 5 breakpoints across the file at once, then walks through them sequentially.
Violates the one-breakpoint-at-a-time rule.

WRONG:
[SOCRATIC] "Looking at this, I can see that the regex doesn't match `+` because of the character class. Let me set a breakpoint to show you."
Violates the rule against answering the question for the user.
</EXAMPLES>
```

- [ ] **Step 2: Verify file exists and is non-empty**

Run: `wc -l packages/opencode/src/agent/prompt/socratic.txt`
Expected: prints a line count > 50.

- [ ] **Step 3: Commit**

```bash
git add packages/opencode/src/agent/prompt/socratic.txt
git commit -m "feat(socratic): add socratic agent prompt with 5-phase workflow"
```

---

## Task 3: Register the `socratic` agent; remove `debug`, `build`, `plan`

**Files:**
- Modify: `packages/opencode/src/agent/agent.ts`
- Modify: `packages/opencode/src/agent/mode-constraints.ts`

- [ ] **Step 1: Update imports in `agent.ts`**

In `packages/opencode/src/agent/agent.ts`, replace the line:

```typescript
import PROMPT_DEBUG from "./prompt/debug.txt"
```

with:

```typescript
import PROMPT_SOCRATIC from "./prompt/socratic.txt"
```

(All other `PROMPT_*` imports stay.)

- [ ] **Step 2: Replace the `debug` registration with `socratic`**

In `packages/opencode/src/agent/agent.ts`, find the `debug` agent registration (around line 106-128):

```typescript
debug: {
  name: "debug",
  description: "Step-by-step coding with live debugger walkthroughs",
  prompt: PROMPT_DEBUG,
  temperature: 0.2,
  color: "#E06C75",
  steps: 200,
  permission: PermissionNext.merge(
    defaults,
    PermissionNext.fromConfig({
      edit: "allow",
      bash: "allow",
      read: "allow",
      glob: "allow",
      grep: "allow",
      webfetch: "deny",
    }),
    user,
  ),
  options: {},
  mode: "primary",
  native: true,
},
```

Replace it with:

```typescript
socratic: {
  name: "socratic",
  description: "Guided discovery. One question at a time, one breakpoint at a time. Read-only.",
  prompt: PROMPT_SOCRATIC,
  temperature: 0.2,
  color: "#E06C75",
  steps: 200,
  permission: PermissionNext.merge(
    defaults,
    PermissionNext.fromConfig({
      "*": "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      list: "allow",
      bash: "allow",
      webfetch: "deny",
    }),
    user,
  ),
  options: {},
  mode: "primary",
  native: true,
},
```

Note: SOCRATIC must not write/edit source code (HARD-CONSTRAINT #6), so the permission ruleset denies by default and explicitly allows only read-style operations plus `bash` (needed by the debugger to launch the program under inspection).

- [ ] **Step 3: Delete the `build` agent registration**

In `packages/opencode/src/agent/agent.ts`, find the `build` agent block (around line 200-215) and delete the entire block:

```typescript
build: {
  name: "build",
  description: "The default agent. Executes tools based on configured permissions.",
  hidden: true,
  options: {},
  permission: PermissionNext.merge(
    defaults,
    PermissionNext.fromConfig({
      question: "allow",
      plan_enter: "allow",
    }),
    user,
  ),
  mode: "primary",
  native: true,
},
```

- [ ] **Step 4: Delete the `plan` agent registration**

In `packages/opencode/src/agent/agent.ts`, find the `plan` agent block (around line 216-239) and delete the entire block:

```typescript
plan: {
  name: "plan",
  description: "Plan mode. Disallows all edit tools.",
  hidden: true,
  options: {},
  permission: PermissionNext.merge(
    defaults,
    PermissionNext.fromConfig({
      question: "allow",
      plan_exit: "allow",
      external_directory: {
        [path.join(Global.Path.data, "plans", "*")]: "allow",
      },
      edit: {
        "*": "deny",
        [path.join(".opencode", "plans", "*.md")]: "allow",
        [path.relative(Instance.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
      },
    }),
    user,
  ),
  mode: "primary",
  native: true,
},
```

- [ ] **Step 5: Update `MODE_ORDER`**

Find the line (currently around line 402):

```typescript
const MODE_ORDER: Record<string, number> = { pair: 0, debug: 1, vibe: 2, claw: 3, adaptive: 4 }
```

Replace with:

```typescript
const MODE_ORDER: Record<string, number> = { pair: 0, socratic: 1, vibe: 2, claw: 3, adaptive: 4 }
```

- [ ] **Step 6: Update `defaultAgent()` fallback**

Find (currently around line 427):

```typescript
return primary.find((a) => a.name === "adaptive")?.name ?? primary[0].name
```

Replace with:

```typescript
return primary.find((a) => a.name === "socratic")?.name ?? primary[0].name
```

- [ ] **Step 7: Update `mode-constraints.ts`**

Replace the entire contents of `packages/opencode/src/agent/mode-constraints.ts`:

```typescript
export const MODE_CONSTRAINTS: Record<string, string> = {
  pair: "You MUST NOT produce code blocks or use write/edit tools. You are an advisor only.",
  socratic: "You MUST ask one question at a time, paired with at most one live breakpoint. You MUST NOT answer the question for the user — guide them to discover it themselves.",
  vibe: "You MUST parse into discrete tasks, get confirmation, and run the review sub-agent after each task.",
  claw: "You MUST work autonomously with no confirmations. Always self-review and test.",
  adaptive: "You MUST announce every mode transition and assess complexity per step.",
}
```

- [ ] **Step 8: Run typecheck**

Run: `cd packages/opencode && bun run typecheck`
Expected: PASS. (Any failure here indicates a stray reference to `PROMPT_DEBUG`, `debug`, `build`, or `plan` agent registrations.)

- [ ] **Step 9: Run tests (some failures expected here)**

Run: `cd packages/opencode && bun test`
Expected: `test/agent/modes.test.ts` will FAIL because it asserts `debug` is in the agent list. `test/session/debug-phase.test.ts` will still pass (the file hasn't been touched yet). `test/tool/transition-phase.test.ts` may also fail. These will be addressed in subsequent tasks. Note which test files fail.

- [ ] **Step 10: Commit**

```bash
git add packages/opencode/src/agent/agent.ts packages/opencode/src/agent/mode-constraints.ts
git commit -m "feat(agent): register socratic agent; remove debug, build, plan"
```

---

## Task 4: Rewire phase machinery to use SocraticPhase

**Files:**
- Modify: `packages/opencode/src/tool/transition-phase.ts`
- Modify: `packages/opencode/src/session/processor.ts:18,140-142`
- Modify: `packages/opencode/src/session/llm.ts:25,290-292`
- Modify: `packages/opencode/test/tool/transition-phase.test.ts` (if necessary)

- [ ] **Step 1: Rewrite `transition-phase.ts`**

Replace the contents of `packages/opencode/src/tool/transition-phase.ts`:

```typescript
import z from "zod"
import { Tool } from "./tool"
import { SocraticPhase } from "../session/socratic-phase"

export const TransitionPhaseTool = Tool.define("transitionPhase", {
  description: [
    "Move to the next phase of the socratic workflow.",
    "Valid phases: PLANNING, HYPOTHESIS, SOCRATIC, SUMMARIZING, CONFIRMING.",
    "Transitions: PLANNING -> HYPOTHESIS|SOCRATIC; HYPOTHESIS -> SOCRATIC; SOCRATIC -> SUMMARIZING; SUMMARIZING -> CONFIRMING; CONFIRMING -> PLANNING (next slice).",
    "Call this when you have completed the work for the current phase.",
  ].join("\n"),
  parameters: z.object({
    to: z.enum(SocraticPhase.PHASES).describe("The phase to transition to"),
    reason: z.string().describe("Brief explanation of why you are transitioning"),
  }),
  async execute(args, ctx) {
    const state = SocraticPhase.getOrCreate(ctx.sessionID)
    try {
      const next = SocraticPhase.transition(state, args.to)
      const allowedTools = SocraticPhase.toolsForPhase(next.currentPhase)
      return {
        title: `Phase: ${next.currentPhase}`,
        output: [
          `Transitioned to ${next.currentPhase} (step ${next.currentStep}).`,
          `Reason: ${args.reason}`,
          `Available tools: ${allowedTools.join(", ")}`,
        ].join("\n"),
        metadata: {
          phase: next.currentPhase,
          step: next.currentStep,
          error: false as boolean,
        },
      }
    } catch (err: any) {
      return {
        title: "Transition Failed",
        output: err.message as string,
        metadata: {
          phase: state.currentPhase,
          step: state.currentStep,
          error: true as boolean,
        },
      }
    }
  },
})
```

- [ ] **Step 2: Update `processor.ts`**

In `packages/opencode/src/session/processor.ts`:

Find line 18:
```typescript
import { DebugPhase } from "./debug-phase"
```

Replace with:
```typescript
import { SocraticPhase } from "./socratic-phase"
```

Find lines 140-142:
```typescript
if (DebugPhase.isDebugAgent(agent.name)) {
  const phaseState = DebugPhase.get(input.sessionID)
  if (phaseState && !DebugPhase.isToolAllowed(phaseState.currentPhase, value.toolName)) {
```

Replace with:
```typescript
if (SocraticPhase.isSocraticAgent(agent.name)) {
  const phaseState = SocraticPhase.get(input.sessionID)
  if (phaseState && !SocraticPhase.isToolAllowed(phaseState.currentPhase, value.toolName)) {
```

- [ ] **Step 3: Update `llm.ts`**

In `packages/opencode/src/session/llm.ts`:

Find line 25:
```typescript
import { DebugPhase } from "./debug-phase"
```

Replace with:
```typescript
import { SocraticPhase } from "./socratic-phase"
```

Find lines 290-292:
```typescript
if (DebugPhase.isDebugAgent(input.agent.name)) {
  const state = DebugPhase.getOrCreate(input.sessionID)
  const allowed = DebugPhase.toolsForPhase(state.currentPhase)
```

Replace with:
```typescript
if (SocraticPhase.isSocraticAgent(input.agent.name)) {
  const state = SocraticPhase.getOrCreate(input.sessionID)
  const allowed = SocraticPhase.toolsForPhase(state.currentPhase)
```

- [ ] **Step 4: Rewrite the transition-phase test file**

Replace the entire contents of `packages/opencode/test/tool/transition-phase.test.ts`:

```typescript
import { describe, expect, test, beforeEach } from "bun:test"
import { TransitionPhaseTool } from "../../src/tool/transition-phase"
import { SocraticPhase } from "../../src/session/socratic-phase"

const ctx = {
  sessionID: "test-session",
  messageID: "msg-1",
  agent: "socratic",
  abort: AbortSignal.any([]),
  callID: "call-1",
  messages: [] as any[],
  metadata: () => {},
  ask: async () => {},
}

describe("tool.transitionPhase", () => {
  beforeEach(() => {
    SocraticPhase.clear("test-session")
    SocraticPhase.create("test-session")
  })

  test("successful transition from PLANNING to HYPOTHESIS", async () => {
    const tool = await TransitionPhaseTool.init()
    const result = await tool.execute(
      { to: "HYPOTHESIS", reason: "User has not stated hypothesis" },
      ctx,
    )

    expect(result.title).toBe("Phase: HYPOTHESIS")
    expect(result.output).toContain("HYPOTHESIS")
    expect(result.output).toContain("User has not stated hypothesis")
    expect(result.metadata.phase).toBe("HYPOTHESIS")
    expect(result.metadata.step).toBe(0)
  })

  test("successful transition from PLANNING to SOCRATIC (skipping HYPOTHESIS)", async () => {
    const tool = await TransitionPhaseTool.init()
    const result = await tool.execute(
      { to: "SOCRATIC", reason: "User already stated a specific question" },
      ctx,
    )

    expect(result.metadata.phase).toBe("SOCRATIC")
    expect(result.metadata.error).toBe(false)
  })

  test("failed transition from PLANNING to SUMMARIZING", async () => {
    const tool = await TransitionPhaseTool.init()
    const result = await tool.execute(
      { to: "SUMMARIZING", reason: "Skip ahead" },
      ctx,
    )

    expect(result.title).toBe("Transition Failed")
    expect(result.output).toContain("Cannot transition")
    expect(result.output).toContain("PLANNING")
    expect(result.output).toContain("SUMMARIZING")
    expect(result.metadata.error).toBe(true)
  })

  test("parameter 'to' must be a valid phase name", async () => {
    const tool = await TransitionPhaseTool.init()
    try {
      await tool.execute(
        { to: "INVALID_PHASE" as any, reason: "bad phase" },
        ctx,
      )
      expect(true).toBe(false)
    } catch (e: any) {
      expect(e).toBeInstanceOf(Error)
      expect(e.message).toContain("invalid")
    }
  })

  test("step increments when cycling from CONFIRMING back to PLANNING", async () => {
    const tool = await TransitionPhaseTool.init()

    // Walk through the full cycle (HYPOTHESIS skipped for brevity):
    // PLANNING -> SOCRATIC -> SUMMARIZING -> CONFIRMING -> PLANNING
    await tool.execute({ to: "SOCRATIC", reason: "step 1" }, ctx)
    await tool.execute({ to: "SUMMARIZING", reason: "step 2" }, ctx)
    await tool.execute({ to: "CONFIRMING", reason: "step 3" }, ctx)

    const result = await tool.execute({ to: "PLANNING", reason: "next slice" }, ctx)

    expect(result.metadata.phase).toBe("PLANNING")
    expect(result.metadata.step).toBe(1)
  })

  test("output includes available tools for the new phase", async () => {
    const tool = await TransitionPhaseTool.init()
    const result = await tool.execute(
      { to: "SOCRATIC", reason: "begin loop" },
      ctx,
    )

    expect(result.output).toContain("Available tools:")
    expect(result.output).toContain("debugger_set_breakpoints")
    expect(result.output).toContain("debugger_continue_execution")
    expect(result.output).toContain("read")
  })
})
```

- [ ] **Step 5: Run typecheck**

Run: `cd packages/opencode && bun run typecheck`
Expected: PASS — no remaining `DebugPhase` references.

- [ ] **Step 6: Run tests**

Run: `cd packages/opencode && bun test`
Expected: `socratic-phase.test.ts`, `transition-phase.test.ts`, and most others pass. `debug-phase.test.ts` still passes (file untouched). `modes.test.ts` still fails because it asserts `debug` exists. That's fine; addressed next task.

- [ ] **Step 7: Commit**

```bash
git add packages/opencode/src/tool/transition-phase.ts packages/opencode/src/session/processor.ts packages/opencode/src/session/llm.ts packages/opencode/test/tool/transition-phase.test.ts
git commit -m "refactor(socratic): switch transition-phase tool and session hooks to SocraticPhase"
```

---

## Task 5: Update `modes.test.ts` to assert the new agent surface

**Files:**
- Modify: `packages/opencode/test/agent/modes.test.ts`

- [ ] **Step 1: Replace the existing modes test**

Replace the contents of `packages/opencode/test/agent/modes.test.ts`:

```typescript
import { test, expect, describe } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Agent } from "../../src/agent/agent"
import { Standards } from "../../src/agent/standards"

describe("multi-mode system", () => {
  test("expected primary agents are registered; debug/build/plan are not", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agents = await Agent.list()
        const visible = agents.filter((a) => a.mode !== "subagent" && a.hidden !== true)
        const names = visible.map((a) => a.name)
        expect(names).toContain("pair")
        expect(names).toContain("socratic")
        expect(names).toContain("vibe")
        expect(names).toContain("claw")
        expect(names).toContain("adaptive")
        expect(names).not.toContain("debug")
        expect(names).not.toContain("build")
        expect(names).not.toContain("plan")
      },
    })
  })

  test("Tab cycle order is pair, socratic, vibe, claw, adaptive", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agents = await Agent.list()
        const visible = agents.filter((a) => a.mode !== "subagent" && a.hidden !== true)
        const names = visible.map((a) => a.name)
        const pairIdx = names.indexOf("pair")
        const socIdx = names.indexOf("socratic")
        const vibeIdx = names.indexOf("vibe")
        const clawIdx = names.indexOf("claw")
        const adaptiveIdx = names.indexOf("adaptive")
        expect(pairIdx).toBeLessThan(socIdx)
        expect(socIdx).toBeLessThan(vibeIdx)
        expect(vibeIdx).toBeLessThan(clawIdx)
        expect(clawIdx).toBeLessThan(adaptiveIdx)
      },
    })
  })

  test("default agent is socratic when no config override", async () => {
    await using tmp = await tmpdir({ config: {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const def = await Agent.defaultAgent()
        expect(def).toBe("socratic")
      },
    })
  })

  test("review agent is registered as hidden subagent", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const review = await Agent.get("review")
        expect(review).toBeDefined()
        expect(review?.mode).toBe("subagent")
        expect(review?.hidden).toBe(true)
      },
    })
  })

  test("standards prompt loads for review agent", async () => {
    const config = Standards.Config.parse({
      standards: { clean: true, solid: true },
      custom: [],
    })
    const result = await Standards.prompt(config)
    expect(result).toContain("Clean Code Foundations")
    expect(result).toContain("SOLID Principles")
  })

  test("each primary mode has distinct color", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const pair = await Agent.get("pair")
        const socratic = await Agent.get("socratic")
        const vibe = await Agent.get("vibe")
        const claw = await Agent.get("claw")
        const adaptive = await Agent.get("adaptive")
        const colors = [pair?.color, socratic?.color, vibe?.color, claw?.color, adaptive?.color]
        const unique = new Set(colors)
        expect(unique.size).toBe(5)
      },
    })
  })

  test("socratic agent is registered as primary", async () => {
    await using tmp = await tmpdir({ config: {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agent = await Agent.get("socratic")
        expect(agent).toBeDefined()
        expect(agent!.mode).toBe("primary")
        expect(agent!.steps).toBe(200)
        expect(agent!.color).toBe("#E06C75")
      },
    })
  })

  test("pair prompt contains IDENTITY, HARD-CONSTRAINTS, and SELF-CHECK sections", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const pair = await Agent.get("pair")
        expect(pair?.prompt).toContain("<IDENTITY>")
        expect(pair?.prompt).toContain("<HARD-CONSTRAINTS>")
        expect(pair?.prompt).toContain("<SELF-CHECK>")
        expect(pair?.prompt).toContain("NEVER produce code blocks")
      },
    })
  })

  test("socratic prompt contains phase workflow and socratic constraints", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const socratic = await Agent.get("socratic")
        expect(socratic?.prompt).toContain("<IDENTITY>")
        expect(socratic?.prompt).toContain("<HARD-CONSTRAINTS>")
        expect(socratic?.prompt).toContain("PLANNING")
        expect(socratic?.prompt).toContain("HYPOTHESIS")
        expect(socratic?.prompt).toContain("SOCRATIC")
        expect(socratic?.prompt).toContain("SUMMARIZING")
        expect(socratic?.prompt).toContain("one breakpoint")
        expect(socratic?.prompt).toContain("ONE question")
      },
    })
  })

  test("claw prompt contains autonomous workflow and self-review", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const claw = await Agent.get("claw")
        expect(claw?.prompt).toContain("<IDENTITY>")
        expect(claw?.prompt).toContain("<HARD-CONSTRAINTS>")
        expect(claw?.prompt).toContain("self-review")
        expect(claw?.prompt).toContain("NEVER ask for confirmation")
      },
    })
  })

  test("vibe prompt contains task parsing and review requirements", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const vibe = await Agent.get("vibe")
        expect(vibe?.prompt).toContain("<IDENTITY>")
        expect(vibe?.prompt).toContain("<HARD-CONSTRAINTS>")
        expect(vibe?.prompt).toContain("review sub-agent")
        expect(vibe?.prompt).toContain("task list")
      },
    })
  })

  test("adaptive prompt contains complexity assessment and transition rules", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const adaptive = await Agent.get("adaptive")
        expect(adaptive?.prompt).toContain("<IDENTITY>")
        expect(adaptive?.prompt).toContain("<HARD-CONSTRAINTS>")
        expect(adaptive?.prompt).toContain("mode transition")
        expect(adaptive?.prompt).toContain("complexity")
      },
    })
  })
})
```

- [ ] **Step 2: Run the test**

Run: `cd packages/opencode && bun test test/agent/modes.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/opencode/test/agent/modes.test.ts
git commit -m "test(agent): update modes test for socratic agent and new default"
```

---

## Task 6: Delete legacy debug files

**Files:**
- Delete: `packages/opencode/src/agent/prompt/debug.txt`
- Delete: `packages/opencode/src/session/debug-phase.ts`
- Delete: `packages/opencode/test/session/debug-phase.test.ts`

- [ ] **Step 1: Confirm there are no remaining references**

Run: `grep -rn "DebugPhase\|debug-phase\|debug\.txt\|PROMPT_DEBUG" packages/opencode/src packages/opencode/test`
Expected: NO output. If anything matches, fix the remaining reference before deleting files.

- [ ] **Step 2: Delete the legacy files**

```bash
rm packages/opencode/src/agent/prompt/debug.txt
rm packages/opencode/src/session/debug-phase.ts
rm packages/opencode/test/session/debug-phase.test.ts
```

- [ ] **Step 3: Run typecheck**

Run: `cd packages/opencode && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run: `cd packages/opencode && bun test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A packages/opencode/src/agent/prompt/debug.txt packages/opencode/src/session/debug-phase.ts packages/opencode/test/session/debug-phase.test.ts
git commit -m "chore(agent): delete legacy debug agent prompt, phase, and tests"
```

---

## Task 7: Update user-facing documentation

**Files:**
- Modify: `packages/web/src/content/docs/modes.mdx` (English) and the equivalent files under each locale subdirectory.
- Modify: `README.md` and translations (only if they reference `debug` / `build` / `plan`).
- Modify: `AGENTS.md` (only if it references the removed agents).
- Modify: `packages/web/src/content/i18n/*.json` (only if they reference the removed agent names).

- [ ] **Step 1: Enumerate doc files that mention the removed agents**

Run:
```bash
grep -rln '\bdebug\b\|\bbuild\b\|\bplan\b' packages/web/src/content/docs README.md README.*.md AGENTS.md 2>/dev/null
```

Capture the list. Many of these matches will be false positives (e.g., "build the project" vs `build` agent). Focus only on lines describing primary agents.

- [ ] **Step 2: Edit the English `modes.mdx`**

In `packages/web/src/content/docs/modes.mdx`:
- Remove the section describing the `debug` agent and rewrite it as a `socratic` section. The new section should describe: one-question-at-a-time, one-breakpoint-at-a-time, read-only, predict/observe loop, escape hatch ("done"/"I get it"/"stop"/"end").
- Remove any references to `build` and `plan` primary agents.
- If there is a "default agent" section, update it to name `socratic`.

- [ ] **Step 3: Mark non-English translations as stale**

For each locale subdirectory under `packages/web/src/content/docs/` that has a `modes.mdx`:
- Replace the file's main agent-list section with the new English content (acceptable in a single PR), OR
- Add a comment at the top: `<!-- TODO(socratic-migration): translation pending. English version describes new agent surface. -->` and leave the body untouched. Acceptable for one release cycle.

Pick one approach consistently. The simpler approach is to copy the English content into each locale and add the TODO comment for translators.

- [ ] **Step 4: Update root-level `README.md` and translations (if they reference agents)**

Look at `README.md` and the `README.*.md` translations. If any describe the agent set, update them in the same way (English first, locales marked stale or copy-paste).

- [ ] **Step 5: Update `AGENTS.md` (if applicable)**

Open `AGENTS.md`. If it references `debug`, `build`, or `plan`, edit those sections to refer to `socratic` (or remove the references for `build`/`plan`).

- [ ] **Step 6: Update web i18n string tables (if applicable)**

Look at `packages/web/src/content/i18n/en.json` for any keys like `agent.debug.*`, `agent.build.*`, `agent.plan.*`. Replace `debug` keys with `socratic`; remove `build`/`plan` keys. Repeat for other locale JSON files (or mark stale).

- [ ] **Step 7: Build the docs site to verify nothing is broken**

If the repo has a docs build command (check `packages/web/package.json`):

Run: `cd packages/web && bun run build` (or whatever the dev/build script is)
Expected: build succeeds. If there's no build command, skip.

- [ ] **Step 8: Commit**

```bash
git add packages/web README.md README.*.md AGENTS.md
git commit -m "docs: replace debug/build/plan with socratic agent in user-facing docs"
```

---

## Task 8: Manual integration check

This task is not automatable. Mark each box once you've verified the behavior manually.

- [ ] **Step 1: Build and launch opencode locally**

Follow the repo's standard dev launch command (likely `bun run start` inside `packages/opencode` or similar — check `package.json`).

- [ ] **Step 2: Verify the agent list**

In the running CLI, list available agents (e.g., via the tab cycle or `/agents`). Confirm:
- `pair`, `socratic`, `vibe`, `claw`, `adaptive` are present.
- `debug`, `build`, `plan` are NOT present.
- The default agent on startup is `socratic`.

- [ ] **Step 3: Run a minimal Socratic session**

Pick a small TypeScript file in this repo (e.g., something in `packages/util/src/`). Ask the socratic agent: "walk me through how this function works."

Verify the agent:
- (a) Reads the code (PLANNING).
- (b) Asks at most one short hypothesis question (HYPOTHESIS), OR skips to SOCRATIC if your message was specific.
- (c) Enters the SOCRATIC loop and sets exactly ONE breakpoint per question.
- (d) Asks ONE question per iteration and waits for your response (in PREDICT mode).
- (e) Removes the previous breakpoint before setting the next.
- (f) Summarizes at the end (SUMMARIZING uses no tools).
- (g) Asks the wrap-up question in CONFIRMING.

- [ ] **Step 4: Verify the user escape hatch**

In another session, partway through the SOCRATIC loop, type "done". Verify the agent immediately transitions to SUMMARIZING and does not ask another question.

- [ ] **Step 5: Verify the agent refuses to edit code**

In a Socratic session, ask: "can you fix this bug for me?" Verify the agent declines and offers to investigate via the loop instead (HARD-CONSTRAINT #6).

- [ ] **Step 6: Commit only if any small fixes were needed**

If manual testing surfaced a small fix (e.g., a typo in the prompt that confuses the agent), make the edit and commit:

```bash
git add packages/opencode/src/agent/prompt/socratic.txt
git commit -m "fix(socratic): clarify wording surfaced during manual testing"
```

---

## Self-Review Checklist

After all tasks complete, run a final check:

- [ ] `cd packages/opencode && bun run typecheck` passes.
- [ ] `cd packages/opencode && bun test` all green.
- [ ] `grep -rn "DebugPhase\|debug-phase\|PROMPT_DEBUG" packages/opencode` returns nothing.
- [ ] `grep -rn '"debug"\|"build"\|"plan"' packages/opencode/src/agent` returns nothing relevant to the removed agents.
- [ ] Default agent for a fresh session is `socratic`.

If all pass, this implementation is complete.
