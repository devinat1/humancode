# HumanCode Multi-Mode Coding Agent Design

## Overview

Four automation levels for coding tasks, auto-selected by a complexity assessor, overridable with Tab. Built on opencode's existing agent registry — each mode is a registered agent with its own system prompt, tool permissions, and behavior.

## Modes

### Pair Mode

Pair programming partner. Suggests approaches and explains trade-offs. Never writes code.

- **Agent name:** `pair`
- **Temperature:** 0.4
- **Tools:** Read-only — `read`, `grep`, `glob`, `ls`, `websearch`, `webfetch`, `codesearch`
- **Behavior:**
  - Analyzes codebase and breaks tasks into steps
  - Explains what needs to change, where, and why
  - Asks guiding questions to develop the user's thinking
  - Reviews code the user writes and offers feedback
  - Suggests patterns, existing utilities, and pitfalls
  - Provides increasingly specific hints when the user is stuck
- **Constraint:** No code blocks intended for copy-paste. Pseudocode and API signatures are fine.

### Debug Mode (Existing)

Writes code one step at a time, walks user through each step with VS Code debugger.

- **Agent name:** `debug`
- **Temperature:** 0.2
- **Tools:** All including debugger MCP tools
- **No changes required** — already implemented.

### Vibe Mode

Multi-task manager. User queues tasks, agent works through them with self-review, user reviews results at the end.

- **Agent name:** `vibe`
- **Temperature:** 0.3
- **Tools:** All standard tools + task management
- **Step limit:** 100+ per task
- **Behavior:**
  - Parses prompt into discrete tasks (asks for clarification if ambiguous)
  - Presents task list for confirmation before starting
  - Works through tasks sequentially, spawning sub-agents as needed
  - Runs self-review sub-agent after each task against enabled standards
  - Fixes violations (max 3 iterations per task)
  - Presents per-task summary with diffs when all tasks complete
- **Task queue:**
  - One parent session, child sessions per task (uses existing parent/child support)
  - User can add, reorder, or cancel pending tasks while agent works
  - User can accept, reject, or request changes on individual tasks at the end

### Claw Mode

Single prompt, fully autonomous, long-running. Iterates until quality standards pass.

- **Agent name:** `claw`
- **Temperature:** 0.2
- **Tools:** All standard tools + self-review
- **Step limit:** 500+
- **Behavior:**
  - Accepts a single prompt describing the end goal
  - Plans implementation autonomously (uses `plan` agent internally)
  - Executes end-to-end: writes code, writes tests, runs tests
  - Self-review loop: generate diff, review against standards, fix violations, re-review (max 3 iterations), re-run tests
  - Presents final result with summary, diff, test results, review verdict
- **Autonomy:** All permissions set to `allow` by default (no prompts during run)
- **Safety:**
  - Operates on a git branch, never directly on main
  - User can cancel with Ctrl+C, changes remain in working tree
  - Dangerous operations (force push, file deletion outside project, env files) still require confirmation
  - Refuses to run without `.humancode/standards.yml`

## Complexity Assessor

A heuristic function in `packages/opencode/src/agent/assessor.ts`. No LLM call — runs instantly.

### Prompt Signals

| Signal | Measurement |
|--------|-------------|
| Task count | Split on conjunctions, bullets, numbered lists, semicolons |
| Scope keywords | Keyword-to-weight map: "fix typo" low, "refactor" high, "build" high, "rename" low |
| Learning intent | "explain", "understand", "walk me through", "why does", "how does" |
| Specificity | References to specific files/functions lower complexity; vague descriptions raise it |

### Codebase Signals

| Signal | Measurement |
|--------|-------------|
| Files touched | Grep for identifiers/paths in prompt, count matches |
| File complexity | Line count of matched files |
| Cross-package spread | Distinct packages under `packages/` touched |
| Test coverage | Existence of `.test.ts` or `__tests__/` for touched files |

### Scoring

```
complexity = prompt_complexity_weight + (files_touched * 2) + (packages_spread * 5) + (no_tests * 3)
```

### Decision Matrix

| Condition | Mode |
|-----------|------|
| Learning intent detected | Pair |
| Multiple distinct tasks | Vibe |
| complexity < 15, single task | Claw |
| complexity >= 15, single task | Debug |

### Output

```
Recommending claw mode — single file change, tests exist. Confidence: 91%. Override with Tab.
```

Confidence based on signal agreement. Low confidence when prompt is ambiguous.

## Quality Standards System

### Standards Catalog

| Standard | Key | Source |
|----------|-----|--------|
| Clean Code Foundations | `clean` | Naming, functions, structure, comments, error handling, testing, general discipline |
| SOLID Principles | `solid` | SRP, OCP, LSP, ISP, DIP |
| Elegant Objects (OOP) | `oop` | Immutable objects, no static/nulls/getters, composition over inheritance |
| Clean Code (Bob Martin) | `bob` | Functions <20 lines, newspaper-order, Law of Demeter, DRY, TDD |
| TypeScript & React | `typescript_react` | Tailwind-only, named params, const-only, functional patterns, strong types |
| Domain-Driven Design | `ddd` | Aggregate rules, bounded contexts, domain modeling, repositories, domain events |

### Config File

`.humancode/standards.yml` in project root:

```yaml
standards:
  clean: true
  solid: true
  oop: false
  bob: true
  typescript_react: true
  ddd: false

custom:
  - "All API endpoints must validate input with Zod schemas"
  - "No console.log in production code"
```

### First-Run Flow

When no `.humancode/standards.yml` exists and user enters vibe or claw mode, present the catalog with checkboxes. Generate config on confirmation.

### Self-Review Sub-Agent

- **Agent name:** `review`
- **Mode:** `subagent` (hidden, internal)
- **Input:** Diff of changes + enabled standards (full text in system prompt) + project context (AGENTS.md, lint configs)
- **Output:** Structured verdict — `pass` or `fail` with violations list (file, line, standard key, explanation)
- **Max iterations:** 3 per review cycle
- **Standards stored as markdown** in `packages/opencode/src/agent/standards/` — one file per group, concatenated into review prompt based on config

## TUI Integration

### Mode Indicator

Status bar badge with distinct color per mode:

| Mode | Label | Color |
|------|-------|-------|
| Pair | `PAIR` | Blue |
| Debug | `DEBUG` | Yellow |
| Vibe | `VIBE` | Green |
| Claw | `CLAW` | Red |

### Tab Cycling

Pair -> Debug -> Vibe -> Claw -> Pair. Toast on switch: "Switched to VIBE mode". Mode switch mid-session changes system prompt and tool permissions for the next message.

### Auto-Selection Flow

1. User types prompt
2. Assessor runs (heuristics, instant)
3. Mode auto-selected, one-line recommendation displayed with confidence
4. Agent starts working immediately
5. User hits Tab to override at any time

### Vibe Mode Task Queue Panel

Below prompt input. One line per task with status: `○` pending, `◐` in progress, `◉` reviewing, `●` done, `✕` issues. Scrollable.

### Claw Mode Progress Log

Replaces message stream with phase indicator:

```
▸ Planning...
▸ Implementing (3/7 steps)...
▸ Running tests...
▸ Reviewing against standards (pass 2/3)...
```

Final result renders as normal message with diff and summary.

### First-Run Standards Dialog

Presented when entering vibe/claw mode without `.humancode/standards.yml`. Shows catalog with checkboxes, generates config on confirmation.
