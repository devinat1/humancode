# Socratic agent: replace debug, remove build and plan

**Status:** Draft
**Date:** 2026-05-19
**Author:** brainstormed with devinat11@gmail.com

## Summary

Replace the existing `debug` primary agent with a new `socratic` primary agent that guides users to discover code behavior through one-question-one-breakpoint dialog. As part of the same change, remove the `build` and `plan` primary agents and make `socratic` the new default agent.

The current `debug` agent crams three sub-modes (Build, Fix, Explain) into one prompt and one phase machine. The Socratic agent is a single-purpose successor focused only on guided discovery; the Build/Fix flows are removed entirely.

## Motivation

The existing debug mode already asks comprehension questions during a `DEBUGGING` phase, but it batches all breakpoints upfront and asks questions only after execution arrives at each one. It does not pace the user, does not pair each question with a single targeted breakpoint, and does not start from the user's hypothesis.

The Socratic agent inverts this: each question is paired with exactly one breakpoint, breakpoints are set conservatively (one live at a time), and the agent's role is to guide the user to discover the answer themselves rather than narrate observations.

The companion cleanup (remove `build` and `plan`) reflects a decision to narrow the primary-agent surface around the agents the project will continue to invest in.

## Goals

- Introduce a `socratic` primary agent with a dedicated 5-phase machine and a one-question-one-breakpoint loop.
- Remove the `debug`, `build`, and `plan` primary agents.
- Make `socratic` the default agent.
- Keep the existing debugger MCP server (`packages/debugger/*`) untouched — its tools are sufficient.

## Non-goals

- Providing a migration path for users of the removed Build / Fix / Plan flows. Users will fall back to other agents (`pair`, `claw`, `vibe`, `adaptive`) and lose debugger gating for code-writing flows. This is intentional.
- Changing subagents (`general`, `explore`, `review`) or system agents (`compaction`, `title`, `summary`, `assessor`).
- Changing the debugger MCP server, DAP adapters, or any debugger tools.
- Adding new debugger tools. The set in `packages/debugger/src/tools/*` is sufficient.

## Design

### Agent surface after the change

Primary agents that remain: `pair`, `socratic` (new, default), `vibe`, `claw`, `adaptive`.

Primary agents removed: `debug`, `build`, `plan`.

Subagents and system agents are unchanged.

### Socratic agent behavior

The agent runs one of three intent types based on the user's opening message:

- **Symptom or bug.** "The login route returns 500 when email contains `+`." Question arc traces from entry point toward the failure.
- **Code location or concept.** "Walk me through how auth tokens are validated." No bug; pure understanding.
- **Specific question.** "Why does this function return undefined when I expect a string?" Narrowest scope.

Across all three, the loop is the same. The agent's job is to ask one question at a time, pair each question with exactly one breakpoint, and let the user discover the answer.

### Phase machine

```
PLANNING → HYPOTHESIS → SOCRATIC → SUMMARIZING → CONFIRMING → PLANNING
```

| Phase | Purpose | Tools allowed |
|---|---|---|
| **PLANNING** | Read code, identify slice, pick entry point, sketch question arc. | `read`, `glob`, `grep`, `task`, `transitionPhase` |
| **HYPOTHESIS** | Ask the user one to two short questions to surface their current mental model. Skip if the opening message already states a hypothesis or specific question. | `read`, `transitionPhase` |
| **SOCRATIC** | The core loop. See below. | `debugger_set_breakpoints`, `debugger_remove_breakpoints`, `debugger_list_breakpoints`, `debugger_start_debug_session`, `debugger_continue_execution`, `debugger_step_over`, `debugger_step_into`, `debugger_step_out`, `debugger_get_variables`, `debugger_get_call_stack`, `debugger_evaluate_expression`, `read`, `transitionPhase` |
| **SUMMARIZING** | No tools. Narrate the slice in plain language, highlighting where predictions matched or mismatched and what the user discovered. | `transitionPhase` |
| **CONFIRMING** | Stop the debug session if running. Ask "go deeper, switch agents, or end?" Wait for user input. | `debugger_stop_debug_session`, `transitionPhase` |

Valid transitions:

```
PLANNING    → HYPOTHESIS, SOCRATIC      (SOCRATIC if hypothesis is skipped)
HYPOTHESIS  → SOCRATIC
SOCRATIC    → SUMMARIZING
SUMMARIZING → CONFIRMING
CONFIRMING  → PLANNING                  (back to top of next slice)
```

`SUMMARIZING` is not skippable.

### The SOCRATIC loop

The SOCRATIC phase is a single phase that internally loops. The agent stays in SOCRATIC until the slice ends naturally (function returned, request responded, end of relevant code) or the user signals done.

One iteration of the loop:

1. Read code to decide the next question and the line whose execution will answer it.
2. Choose **predict** or **observe** based on what the question is about:
   - **Predict:** Question is about *upcoming* behavior. Ask it first, wait for the user's answer, then set the breakpoint on the relevant line, advance execution, reveal the actual state, give feedback comparing prediction to reality.
   - **Observe:** Question is about *prior* state. Set the breakpoint, advance, reveal state, then ask "what does this tell you about [X]?" and wait for the user's reasoning.
3. After the user responds, remove the breakpoint just visited, then return to step 1 with the next question.

Termination of the loop:

- **Default:** Loop ends when execution reaches the natural endpoint of the slice. Concretely: the function under examination returns, an HTTP response is sent, the call stack pops past the entry frame the agent picked in PLANNING, or the program exits. For loops or recursive paths, the agent picks one iteration to walk through and treats exit-from-that-iteration as the endpoint.
- **User escape hatch:** At any time, the user can say "done," "I get it," "stop," "end," or similar. (Not "next," which could be ambiguous with "next question.") The agent acknowledges and transitions to SUMMARIZING immediately.

#### Conservative breakpoint rule

At most **one breakpoint live at a time** during the SOCRATIC phase. After execution passes a breakpoint, the agent removes it before setting the next one. This is a hard constraint in the prompt and is checked in the agent's self-check before each tool call.

#### Predict vs observe heuristic

The agent decides per question:

- Question about a value that will *appear* on the current line or downstream → predict-first.
- Question about a value already computed before the current line → observe-first.
- Question about control flow ("which branch runs here?") → predict-first.
- Question about why something went wrong → observe-first, then probe with "what would you expect instead?"

#### First-principles questioning

Questions build from concrete observations (types, values, control flow, invariants) up to higher-level behaviors. The agent does not ask "do you understand this?" — it asks specific concrete questions whose answers reveal whether the user understands. Examples:

- "Given input `email = 'a+b@x.com'`, what type is `req.body.email` at this point?"
- "Which branch will the conditional take here, given `user.role === 'admin'`?"
- "What value must `tokens.length` be for the loop body to execute?"

The agent avoids leading questions ("isn't it obvious that...") and avoids questions that can be answered without engaging with the code.

#### Handling wrong answers

When the user's prediction is wrong:
- Acknowledge briefly.
- Show the actual value.
- Ask a follow-up that probes the gap ("what would have to be different for your prediction to be right?").
- Do not lecture or pile on hints; let the next breakpoint do the teaching.

The agent does not loop on the same question. One follow-up max, then move on.

### Hard constraints (prompt-enforced)

The Socratic agent's prompt enforces these absolute rules, modeled after the existing `debug.txt` style:

1. Never have more than one breakpoint live at a time during SOCRATIC. Before setting a new breakpoint, remove the previous one (or confirm via `debugger_list_breakpoints` that none remain).
2. Always ask exactly one question per loop iteration. Never batch questions.
3. After asking a question (predict-first mode), STOP and wait for the user. Do not call any other tool until the user responds.
4. Use `transitionPhase` to move between phases. Never skip a phase. SUMMARIZING is not skippable.
5. Honor "done" / "I get it" / "stop" / "end" from the user at any time. Immediately transition to SUMMARIZING. ("Next" is reserved for the agent's own internal loop progression and is not a user signal.)

### Code restructure

#### Files renamed or moved

- `packages/opencode/src/agent/prompt/debug.txt` → `packages/opencode/src/agent/prompt/socratic.txt`. Content rewritten to describe Socratic behavior, hard constraints, and the SOCRATIC loop.
- `packages/opencode/src/session/debug-phase.ts` → `packages/opencode/src/session/socratic-phase.ts`. The `DebugPhase` namespace renamed to `SocraticPhase`. Phase list becomes the new 5 phases. `VALID_TRANSITIONS` and `PHASE_TOOLS` rewritten per the table above. `isDebugAgent` renamed to `isSocraticAgent` and returns true only for `"socratic"`.

#### Files modified

- `packages/opencode/src/agent/agent.ts`:
  - Remove the `debug`, `build`, and `plan` agent registrations.
  - Add the `socratic` agent registration with description.
  - Update `MODE_ORDER` (currently at line 402) to reflect the new agent set. Suggested ordering: `pair: 0, socratic: 1, vibe: 2, claw: 3, adaptive: 4`.
  - Update `defaultAgent()` so it returns `socratic` when no `default_agent` config is set. Today `build` was implicitly the default; with `build` removed, `socratic` takes its place.
- `packages/opencode/src/session/processor.ts` and `packages/opencode/src/session/llm.ts`: update any imports referencing `debug-phase` or `DebugPhase` to point at `socratic-phase` / `SocraticPhase`.
- `packages/opencode/src/tool/transition-phase.ts`: rewire to gate on `isSocraticAgent`. Update the tool's documentation/schema if it references "debug phases."
- `packages/opencode/src/agent/mode-constraints.ts`: review for any `debug`/`build`/`plan` references and update.

#### Files removed

- None outright. (Tests get renamed, not deleted; prompts get rewritten, not deleted.)

#### Tests

- `packages/opencode/test/session/debug-phase.test.ts` → `packages/opencode/test/session/socratic-phase.test.ts`. Rewritten to assert:
  - Valid transitions match the new 5-phase machine.
  - Invalid transitions throw (e.g., `PLANNING → SUMMARIZING`).
  - `isSocraticAgent("socratic")` is true; everything else false.
  - HYPOTHESIS-skip transition (`PLANNING → SOCRATIC`) is allowed.
  - SUMMARIZING is reachable only from SOCRATIC.
- `packages/opencode/test/tool/transition-phase.test.ts`: updated for the new phase set and the renamed agent.
- `packages/opencode/test/agent/modes.test.ts`: assertions about `debug` / `build` / `plan` removed; assertions about `socratic` added; assert it is the default.

#### Documentation

- `packages/web/src/content/docs/**/modes.mdx` (multilingual): rewrite to describe the new agent surface. Remove `debug`, `build`, `plan` sections; add `socratic`. The implementer should grep `packages/web/src/content/i18n/*.json` for `"debug"`, `"build"`, `"plan"` agent strings and clean those up too.
- `README.md` and translations: if any reference these agents, update.
- `AGENTS.md` if it references the removed agents.

## Risks

- **Default-agent fallback.** Removing `build` without a careful read of `defaultAgent()` could leave the system with no default. The implementer must verify `socratic` is wired as the fallback in `Agent.defaultAgent()` (`packages/opencode/src/agent/agent.ts:413`) and that any code that hard-codes `"build"` as a default is updated.
- **`/plan` UX collision.** If Claude Code's `/plan` shortcut routes to the `plan` agent, removing the agent will break that shortcut. The implementer must check the CLI command surface in `packages/opencode/src/cli/` and either remove or rebind `/plan`.
- **External user configs.** Users with `default_agent: "build"` or `default_agent: "debug"` in their `opencode.json` config will hit a "default agent not found" error on next launch. Spec does not require migration shims; user-visible breakage is accepted.
- **Web docs scope.** The multilingual `modes.mdx` updates touch ~16 locales. Implementer can mark non-English translations as stale (TODO comments) rather than translating in one PR.
- **Agent discovery telemetry.** If any analytics or observability tags by agent name, dashboards will show drop-offs for `debug`/`build`/`plan` and a spike for `socratic`. Out of scope for this spec but worth a note to the implementer.

## Open questions deferred to implementation

- Whether `SocraticPhase` namespace should live in `session/` (current pattern) or be moved to a dedicated `agent/socratic/` directory. The current pattern is simpler; keep it unless the implementer finds a strong reason otherwise.
- Exact wording of the user-facing "natural endpoint reached" message and the wrap-up prompt in CONFIRMING. Iterate in the prompt during implementation.

## Acceptance

- `bun test` passes in `packages/opencode`.
- A manual session: invoke `socratic` agent, give it a small TypeScript function with a bug, observe that the agent (a) reads the code, (b) asks at most one hypothesis question, (c) enters the SOCRATIC loop, (d) sets exactly one breakpoint per question, (e) waits for the user's response before continuing, (f) summarizes at the end, (g) honors a mid-flow "done" by transitioning to SUMMARIZING.
- Default agent for a fresh session (no `default_agent` config) is `socratic`.
- Running the CLI shows `pair`, `socratic`, `vibe`, `claw`, `adaptive` as the only primary agents.
