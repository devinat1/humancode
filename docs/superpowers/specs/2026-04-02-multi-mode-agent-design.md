# HumanCode Multi-Mode Coding Agent Design

## Overview

Four automation levels for coding tasks, auto-selected by a complexity assessor, overridable with Tab. Built on opencode's existing agent registry — each mode is a registered agent with its own system prompt, tool permissions, and behavior.

### Relationship to Existing Agents

The four modes **replace** the existing `build` and `plan` primary agents:

- `build` is replaced by `vibe` (multi-task) and `claw` (autonomous) which cover its use cases with added self-review
- `plan` is absorbed into `pair` (read-only analysis and guidance) and used internally by `claw` for planning phases
- `debug` remains unchanged
- `build` and `plan` are removed from the Tab cycle but remain available via explicit agent selection in the command palette for backwards compatibility
- Sub-agents (`general`, `explore`, `compaction`, `title`, `summary`) are unchanged

## Modes

### Pair Mode

Pair programming partner. Suggests approaches and explains trade-offs. Never writes code.

- **Agent name:** `pair`
- **Temperature:** 0.4
- **Tools:** Read-only — `read`, `grep`, `glob`, `ls`, `websearch`, `webfetch` (network tools included since they gather information without modifying the project)
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
- **Tools:** All standard tools. Task queue management is handled by the vibe agent itself (not a separate tool) — it maintains an internal task list and uses child sessions via the existing `task` tool to execute each task in isolation.
- **Step limit:** 100 per task (configurable via opencode agent config `steps` field)
- **Behavior:**
  - Parses prompt into discrete tasks (asks for clarification if ambiguous)
  - Presents task list for confirmation before starting
  - Works through tasks sequentially, spawning sub-agents as needed
  - Runs self-review sub-agent after each task against enabled standards
  - Fixes violations (max 3 iterations per task)
  - Presents per-task summary with diffs when all tasks complete
- **Task queue:**
  - One parent session, child sessions per task (uses existing parent/child support)
  - User can add tasks via the prompt input while agent works (appended to queue)
  - User can cancel pending tasks via keyboard shortcut (Ctrl+D on selected task in queue panel)
  - User can accept, reject, or request changes on individual tasks at the end
- **Error recovery:** If a task fails (crash, model error, unrecoverable), mark it as failed with error context, skip to the next task, and include the failure in the end-of-run summary. User can re-queue failed tasks.

### Claw Mode

Single prompt, fully autonomous, long-running. Iterates until quality standards pass.

- **Agent name:** `claw`
- **Temperature:** 0.2
- **Tools:** All standard tools + self-review
- **Step limit:** 500 (configurable via opencode agent config `steps` field)
- **Behavior:**
  - Accepts a single prompt describing the end goal
  - Plans implementation autonomously (uses `plan` agent internally)
  - Executes end-to-end: writes code, writes tests, runs tests
  - Self-review loop: generate diff, review against standards, fix violations, re-review (max 3 iterations), re-run tests
  - Presents final result with summary, diff, test results, review verdict
  - If step limit (500) is exhausted before completion: stop, present partial results with a summary of what was completed and what remains. Worktree is preserved for manual continuation or a new Claw session.
- **Autonomy:** All permissions set to `allow` by default (no prompts during run)
- **Safety:**
  - Creates a git worktree using the existing `Worktree` system (`packages/opencode/src/worktree/`). Branch naming: `opencode/claw/<session-slug>` (uses existing `opencode/` prefix convention). On completion, offers to merge into the original branch or create a PR.
  - If user is already on a non-main branch, the worktree branches from the current branch.
  - User can cancel with Ctrl+C. Worktree and changes remain for inspection. TUI reverts to normal message view showing a partial summary of work completed.
  - Dangerous operations (force push, file deletion outside project, env files) still require confirmation even in claw mode.
  - Refuses to run without `.humancode/standards.yml` in interactive mode (TUI presents the first-run dialog to generate the file before Claw starts). In non-interactive mode, falls back to defaults per the First-Run Fallback rules.

## Complexity Assessor

A heuristic function in `packages/opencode/src/agent/assessor.ts`. No LLM call — runs instantly.

### Prompt Signals

| Signal | Measurement | Value |
|--------|-------------|-------|
| Task count | Split on conjunctions, bullets, numbered lists, semicolons | Count of distinct tasks |
| Scope keywords | Keyword weight: "fix typo/rename/update" = 2, "add/implement" = 5, "refactor/redesign/build from scratch" = 10 | Highest matching weight |
| Learning intent | "explain", "understand", "walk me through", "why does", "how does" | Boolean flag |
| Specificity | Each specific file/function reference = -2 (lowers complexity); no specifics = +5 | Sum |

### Codebase Signals

| Signal | Measurement | Value |
|--------|-------------|-------|
| Files touched | Grep for identifiers/paths in prompt, count matching files | Count |
| File complexity | Average line count of matched files / 100 (capped at 5) | 0-5 |
| Cross-package spread | Distinct packages under `packages/` touched | Count |
| Untested files | Count of matched files without corresponding `.test.ts` or `__tests__/` | Count |

### Scoring

```
complexity = scope_keyword_weight
           + specificity_adjustment
           + (files_touched * 2)
           + (packages_spread * 5)
           + (untested_files * 3)
           + file_complexity
```

### Decision Matrix

Evaluated in priority order — first match wins:

| Priority | Condition | Mode | Rationale |
|----------|-----------|------|-----------|
| 1 | Learning intent detected | Pair | User wants to understand, not ship |
| 2 | Multiple distinct tasks (task_count >= 2) | Vibe | Multi-task queue is the right workflow |
| 3 | Single task, complexity < 15 | Claw | Simple enough for full autonomy |
| 4 | Single task, 15 <= complexity <= 30 | Vibe | Moderate complexity benefits from self-review checkpoints |
| 5 | Single task, complexity > 30 | Debug | High complexity needs human step-through |

Note: Debug mode is reserved for genuinely complex, high-risk changes where step-by-step human verification is valuable. Moderate complexity routes to Vibe, not Debug.

### Confidence Score

Confidence is based on how decisive the scoring is — how far the result is from the nearest decision boundary:

```
margin = min(|complexity - 15|, |complexity - 30|)
confidence = min(95, 50 + (margin * 3))
```

Special cases:
- Learning intent with no complexity signals: confidence = 90% (strong signal)
- Multiple tasks detected: confidence = 85% (clear structural signal)
- If the complexity score falls within 3 points of a boundary (12-18 or 27-33): confidence capped at 65%

- **High confidence (>= 75%):** Auto-select and proceed. Display recommendation inline.
- **Low confidence (< 75%):** Auto-select but flag uncertainty: "Recommending vibe mode, but this could also be a claw task. Confidence: 62%. Override with Tab."

### Output

```
Recommending claw mode — single file change, tests exist. Confidence: 91%. Override with Tab.
```

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

### Self-Review Sub-Agent

- **Agent name:** `review`
- **Mode:** `subagent` (hidden, internal)
- **Temperature:** 0.1 (deterministic, consistent reviews)
- **Tools:** Read-only — `read`, `grep`, `glob`, `ls` (needs to read files referenced in diffs for context)
- **Input:** Diff of changes + enabled standards (full text in system prompt) + project context (AGENTS.md, lint configs)
- **Output:** Structured JSON verdict:
  ```json
  {
    "verdict": "pass" | "fail",
    "violations": [
      { "file": "src/foo.ts", "line": 42, "standard": "clean", "rule": "naming", "explanation": "..." }
    ]
  }
  ```
- **Max iterations:** 3 per review cycle. Both Vibe and Claw reference this same 3-iteration limit — the review sub-agent enforces it, not the parent agents.
- **Standards stored as markdown** in `packages/opencode/src/agent/standards/` — one file per standard group (e.g., `clean.md`, `solid.md`, `bob.md`). Each file contains the full text of that standard's rules. The review agent's system prompt is composed by concatenating the enabled standard files based on `.humancode/standards.yml`.

### First-Run Fallback

When no `.humancode/standards.yml` exists:

- **Interactive (TUI):** Present standards catalog dialog with checkboxes. Generate config on confirmation.
- **Non-interactive (CI, API, headless):** Use default config with `clean` and `solid` enabled. Log a warning: "Using default standards. Create .humancode/standards.yml to customize."
- **Malformed config:** Warn and fall back to defaults. Do not block execution.

### Mode Persistence

The selected mode is stored on the session record. When reopening a session, it resumes in the same mode. New sessions start with auto-selection. The `session` table gains a `mode` column (text, nullable — null means auto-select).

### Mid-Session Switching

- **Pair/Debug:** Switch takes effect on the next message. No interruption.
- **Vibe (in progress):** Switching away pauses the task queue. Pending tasks remain. Switching back resumes.
- **Claw (in progress):** Switching away cancels the autonomous run. Work completed so far remains in the worktree. A summary of progress is shown. The user can switch back to Claw to resume (new prompt picks up where it left off via the worktree state).

## TUI Integration

### Mode Indicator

Status bar badge with distinct color per mode:

| Mode | Label | Color |
|------|-------|-------|
| Pair | `PAIR` | Blue (#61AFEF) |
| Debug | `DEBUG` | Salmon (#E06C75, existing) |
| Vibe | `VIBE` | Green (#98C379) |
| Claw | `CLAW` | Purple (#C678DD) |

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
