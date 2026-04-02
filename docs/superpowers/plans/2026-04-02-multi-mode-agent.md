# Multi-Mode Coding Agent Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four automation modes (pair, debug, vibe, claw) to HumanCode with complexity-based auto-selection and configurable quality standards.

**Architecture:** Each mode is a registered agent in the existing agent registry. A complexity assessor function recommends the best mode based on prompt and codebase analysis. A review sub-agent checks code quality against configurable standards. The TUI shows a mode badge and supports Tab cycling.

**Tech Stack:** TypeScript, Bun, Solid.js (TUI), Drizzle ORM (SQLite), Zod schemas

**Spec:** `docs/superpowers/specs/2026-04-02-multi-mode-agent-design.md`

---

## Chunk 1: Quality Standards Infrastructure

### Task 1: Create standards markdown files

**Files:**
- Create: `packages/opencode/src/agent/standards/clean.md`
- Create: `packages/opencode/src/agent/standards/solid.md`
- Create: `packages/opencode/src/agent/standards/oop.md`
- Create: `packages/opencode/src/agent/standards/bob.md`
- Create: `packages/opencode/src/agent/standards/typescript_react.md`
- Create: `packages/opencode/src/agent/standards/ddd.md`

- [ ] **Step 1: Create `clean.md`**

```markdown
# Clean Code Foundations

## Naming
Use descriptive, intention-revealing names. A variable name should tell you why it exists, what it does, and how it's used.
Avoid abbreviations and single-letter names outside of tiny loop scopes.
Use consistent naming conventions across the codebase (e.g., camelCase for variables, PascalCase for types/classes).
Name booleans as predicates: isActive, hasPermission, shouldRetry.
Name functions after what they do, not how they do it.

## Functions
Keep functions short and focused on a single task. If you need a comment to explain a section, extract it into a well-named function.
Limit parameters. More than 3 usually means you should pass an object/struct.
Avoid side effects. A function named getUser should not also modify state. If it does, the name should reflect that.
Prefer pure functions where practical — same inputs, same outputs, no hidden state.
Return early to avoid deep nesting. Guard clauses up top, happy path below.

## Structure and Organization
Follow the Single Responsibility Principle at every level: functions, modules, and files should each have one reason to change.
Group code by feature/domain, not by technical layer, when the codebase is large enough to warrant it.
Keep files focused. If a file requires extensive scrolling or has multiple unrelated sections, split it.
Manage dependencies deliberately. Depend on abstractions where volatility is high; depend on concretes where stability is high.

## Error Handling
Handle errors explicitly. Don't swallow exceptions or ignore error return values.
Fail fast and fail loudly in development. Provide clear, actionable error messages.
Use typed/structured errors over raw strings when the language supports it.
Distinguish between recoverable errors (retry, fallback) and programmer errors (crash, fix the bug).

## Comments and Documentation
Code should be self-documenting through clear naming and structure. Comments explain why, not what.
Delete commented-out code. That's what version control is for.
Document public APIs, non-obvious design decisions, and known limitations.
Keep comments maintained. A stale comment is worse than no comment.

## Testing
Write tests that describe behavior, not implementation. Tests should survive refactors.
Each test should have a single reason to fail.
Use descriptive test names that read as specifications: rejects_expired_tokens, returns_empty_list_when_no_results.
Avoid testing private internals. Test the public interface.
Keep tests fast. Slow tests don't get run.

## General Discipline
Don't repeat yourself, but don't abstract prematurely either. Duplication is cheaper than the wrong abstraction.
Leave code cleaner than you found it (Boy Scout Rule).
Prefer immutability and const-correctness by default.
Optimize for readability first, performance second — unless profiling tells you otherwise.
Delete dead code. Unused imports, unreachable branches, vestigial functions — remove them.
Keep diffs small. Small, focused commits and PRs are easier to review, easier to revert, and less likely to introduce bugs.
```

- [ ] **Step 2: Create `solid.md`**

```markdown
# SOLID Principles

## Single Responsibility (SRP)
A class or module should have one reason to change. If a class handles both user authentication and email formatting, split it. When you describe what something does and use the word "and," that's a hint.

## Open/Closed (OCP)
Code should be open for extension but closed for modification. Add new behavior through new code (new classes, new implementations) rather than editing existing, tested code. Polymorphism, strategy patterns, and plugin architectures all serve this.

## Liskov Substitution (LSP)
Subtypes must be substitutable for their base types without breaking correctness. If a function accepts a base class, any derived class should work without surprises.

## Interface Segregation (ISP)
Don't force clients to depend on methods they don't use. Prefer small, focused interfaces over large, general-purpose ones. If implementers routinely leave methods as no-ops or throw NotImplemented, the interface is too wide.

## Dependency Inversion (DIP)
High-level modules should not depend on low-level modules — both should depend on abstractions. Your business logic shouldn't import a specific Postgres driver directly; it should depend on a repository interface that a Postgres implementation satisfies.
```

- [ ] **Step 3: Create `oop.md`**

```markdown
# Elegant Objects (OOP)

Based on the principles from Elegant Objects by Yegor Bugayenko.

## Objects
Treat objects as living organisms with behavior, not passive data bags.
Make objects immutable by default. Use final/readonly fields.
Make objects fully formed at construction time. Everything they need comes through the constructor.

## Naming
Name classes as nouns representing what they are (Invoice, HttpRequest, ParsedFile).
Don't use "-er" names (Manager, Controller, Helper, Validator, Processor).

## Constructors
Use constructors as the sole way to configure and initialize objects.
Don't use static factory methods, builders, or setter-based initialization.
Keep constructors simple — store dependencies, don't do heavy work.

## Getters and Setters
Don't expose internal state through getters.
Don't allow external mutation through setters.
Provide behavior methods instead. Follow "tell, don't ask."

## Static Methods
Don't use static methods. They are procedural code in OOP disguise.
Don't create utility classes (StringUtils, FileUtils, DateUtils).
Use object instances with interfaces so dependencies can be swapped and composed.

## NULL
Don't return null from methods.
Fail fast — throw a meaningful exception if something is genuinely wrong.
Use Null Objects that implement the interface with safe no-op behavior.
Return empty collections instead of null.

## Error Handling
Fail fast and loud. Throw exceptions with clear messages.
Don't return error codes or special sentinel values.
Keep exception handling close to where the error originates.

## Class Design
Keep classes small and focused with a single clear responsibility.
Don't create deep inheritance hierarchies. Prefer composition and decorators.
Program to interfaces, not implementations.

## Encapsulation
Hide all internal representation.
Don't break encapsulation for convenience.
Make it possible to change internal representation without affecting callers.

## General
Don't write code that is clever. Write code that is simple and readable.
Prefer many small objects composed together over few large objects.
Don't use reflection, annotations, or runtime magic.
Make dependencies explicit — if a class needs something, it should be in the constructor.
```

- [ ] **Step 4: Create `bob.md`**

```markdown
# Clean Code (Robert C. Martin)

## Core Philosophy
Code is read far more often than it is written. Optimize for readability.
Leave the code cleaner than you found it (Boy Scout Rule).

## Functions
Keep functions small. Under 20 lines is a good target.
A function should do one thing, do it well, and do it only.
Operate at one level of abstraction per function.
Minimize arguments. Zero is ideal, one or two is fine, three is suspicious.
Don't use flag arguments (booleans that make a function do two different things).
Prefer exceptions over return codes.

## Naming
Names should reveal intent. `elapsedTimeInDays` over `d`.
Classes get noun names. Functions get verb names.
Don't use encodings or prefixes like Hungarian notation.
Use consistent vocabulary. Pick one word per concept.

## Comments
A comment is a failure to express yourself in code.
Acceptable: legal headers, TODOs, warnings, clarification of intent.
Never commit commented-out code. Delete it.

## Error Handling
Use exceptions, not return codes.
Don't return null. Return empty collections or a sensible default.
Don't pass null as a function argument.
Create informative error messages with context.

## Classes and Objects
Classes should be small in responsibility, not just line count.
Single Responsibility Principle: one reason to change.
High cohesion: methods should use most of the class's instance variables.
Prefer composition over inheritance.

## SOLID Principles
SRP: One actor/stakeholder per class.
OCP: Add behavior by adding code, not editing existing code.
LSP: Subtypes must be substitutable without surprises.
ISP: Small, focused interfaces.
DIP: Depend on abstractions. Inject dependencies via constructor.

## Formatting
Files should read like newspaper articles: headline, synopsis, then details.
Keep related code vertically close.
Be consistent with team conventions.

## Boundaries
Wrap third-party APIs in your own thin abstraction layer.
Write learning tests for third-party code.

## Law of Demeter
A method should only call methods on: its own object, its parameters, objects it creates, and its direct collaborators.
Avoid train wrecks: `a.getB().getC().doThing()`.

## DRY
Every piece of knowledge should have a single, unambiguous representation.
Duplication applies to logic, not just literal text.

## Tests
Follow TDD: failing test first, minimal code to pass, refactor.
Tests should be F.I.R.S.T.: Fast, Independent, Repeatable, Self-validating, Timely.
One concept per test. Tests are documentation.
```

- [ ] **Step 5: Create `typescript_react.md`**

```markdown
# TypeScript & React Style

## JSX Elements
Always use <div> and <span>, never semantic HTML (<p>, <h1>, etc.) to prevent style inheritance issues.

## Styling
Tailwind classes only — no inline styles or style objects.
No negative margins allowed.
Use spacing/gap on parent instead of margins on children.
Spacing: multiples of 2 (gap-2, gap-4, p-4, m-8).
Remove redundant responsive breakpoints.

## Component Patterns
Extract repeated JSX into components.
Inline conditional placeholders to avoid duplicate wrappers.
Use ternary operators for conditionals, not &&.

## TypeScript
Avoid .then and .catch — use try/catch instead.
Avoid type casting unless necessary.
Always use named params instead of positional arguments.
Avoid non-null assertions. Use NonNullable<typeof x> casts.
Export types in the types package.
Use const always, never let.
Explicit nullable types: value?: number | null.
Array syntax: items: Item[] not Array<Item>.
Array checks: arr.length === 0 not !arr.
Avoid mutations.
Use strong types: Array<MeetingWithForeignProperties>.

## Naming
Use complete variable names: averageWordsPerMinute not averageWpm.
Complete sentence errors/comments/logs.
Booleans: isOpen, hasData, shouldShow.
Parameters: descriptive (specificUserId not userId).

## Functional Programming
Use Array.from(), .map(), .reduce() instead of for-loops.
Use utility functions: getPluralSuffix(), .toLocaleString().

## General
Do not create a function if it already exists in the codebase.
Avoid unnecessary comments.
No fetch inside components — use helpers.
null is DB-returned empty, undefined is user-level.
```

- [ ] **Step 6: Create `ddd.md`**

```markdown
# Domain-Driven Design

## Aggregate Rules
Reference other aggregates by identity only. Never hold direct object references.
One aggregate per transaction. Handle cross-aggregate consistency via eventual consistency and domain events.
The aggregate root is the sole entry point. External objects may only reference the root.
Enforce invariants within the aggregate boundary.
Keep aggregates small. Only group entities when a true transactional invariant requires it.

## Bounded Context Rules
Each bounded context owns its own ubiquitous language and model.
Models must not leak across context boundaries. Use anti-corruption layers.
A single team should own a bounded context.

## Domain Modeling Rules
Model the domain, not the database. The domain model drives design.
Ubiquitous language is non-negotiable. Code and conversation use the same domain terms.
Entities have identity; value objects do not. Value objects must be immutable.
Domain logic belongs in the domain layer. Avoid anemic models.
Repositories abstract persistence. The domain layer must not know about databases.
Factories handle complex creation.
Domain events capture side effects between aggregates.
```

- [ ] **Step 7: Commit standards files**

```bash
git add packages/opencode/src/agent/standards/
git commit -m "feat: add quality standards markdown files for self-review

Six standard groups: clean, solid, oop, bob, typescript_react, ddd.
Each file contains the full text of its rules for injection into
the review agent's system prompt."
```

### Task 2: Create standards config loader

**Files:**
- Create: `packages/opencode/src/agent/standards.ts`
- Test: `packages/opencode/test/agent/standards.test.ts`

- [ ] **Step 1: Write failing test for standards loader**

```typescript
// packages/opencode/test/agent/standards.test.ts
import { test, expect, describe } from "bun:test"
import { Standards } from "../../src/agent/standards"
import { tmpdir } from "../util/tmpdir"
import path from "path"

describe("Standards", () => {
  test("loads defaults when no config file exists", async () => {
    await using tmp = await tmpdir()
    const config = await Standards.load(tmp.path)
    expect(config.standards.clean).toBe(true)
    expect(config.standards.solid).toBe(true)
    expect(config.standards.oop).toBe(false)
    expect(config.standards.bob).toBe(false)
    expect(config.standards.typescript_react).toBe(false)
    expect(config.standards.ddd).toBe(false)
    expect(config.custom).toEqual([])
  })

  test("loads config from .humancode/standards.yml", async () => {
    await using tmp = await tmpdir()
    const dir = path.join(tmp.path, ".humancode")
    await Bun.file(path.join(dir, "standards.yml")).writer().end(`standards:
  clean: true
  solid: false
  oop: true
  bob: false
  typescript_react: false
  ddd: true
custom:
  - "No console.log in production"
`)
    const config = await Standards.load(tmp.path)
    expect(config.standards.clean).toBe(true)
    expect(config.standards.solid).toBe(false)
    expect(config.standards.oop).toBe(true)
    expect(config.standards.ddd).toBe(true)
    expect(config.custom).toEqual(["No console.log in production"])
  })

  test("builds review prompt from enabled standards", async () => {
    await using tmp = await tmpdir()
    const prompt = await Standards.prompt({
      standards: { clean: true, solid: false, oop: false, bob: false, typescript_react: false, ddd: false },
      custom: [],
    })
    expect(prompt).toContain("Clean Code Foundations")
    expect(prompt).not.toContain("SOLID Principles")
  })

  test("includes custom rules in review prompt", async () => {
    const prompt = await Standards.prompt({
      standards: { clean: false, solid: false, oop: false, bob: false, typescript_react: false, ddd: false },
      custom: ["No console.log in production"],
    })
    expect(prompt).toContain("No console.log in production")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/opencode && bun test test/agent/standards.test.ts`
Expected: FAIL — module `../../src/agent/standards` not found

- [ ] **Step 3: Write standards loader implementation**

```typescript
// packages/opencode/src/agent/standards.ts
import z from "zod"
import path from "path"
import { readFileSync } from "fs"

const STANDARD_KEYS = ["clean", "solid", "oop", "bob", "typescript_react", "ddd"] as const

export namespace Standards {
  export const Config = z.object({
    standards: z.object({
      clean: z.boolean().default(true),
      solid: z.boolean().default(true),
      oop: z.boolean().default(false),
      bob: z.boolean().default(false),
      typescript_react: z.boolean().default(false),
      ddd: z.boolean().default(false),
    }),
    custom: z.array(z.string()).default([]),
  })
  export type Config = z.infer<typeof Config>

  const DEFAULTS: Config = {
    standards: { clean: true, solid: true, oop: false, bob: false, typescript_react: false, ddd: false },
    custom: [],
  }

  export async function load(directory: string): Promise<Config> {
    const file = path.join(directory, ".humancode", "standards.yml")
    const exists = await Bun.file(file).exists()
    if (!exists) return DEFAULTS

    const text = await Bun.file(file).text()
    const parsed = parseYaml(text)
    return Config.parse({ ...DEFAULTS, ...parsed })
  }

  export async function save(directory: string, config: Config): Promise<void> {
    const dir = path.join(directory, ".humancode")
    await Bun.write(path.join(dir, "standards.yml"), toYaml(config))
  }

  export async function prompt(config: Config): Promise<string> {
    const sections: string[] = []

    for (const key of STANDARD_KEYS) {
      if (!config.standards[key]) continue
      const file = path.join(import.meta.dirname, "standards", `${key}.md`)
      sections.push(readFileSync(file, "utf-8"))
    }

    if (config.custom.length > 0) {
      sections.push("# Custom Rules\n\n" + config.custom.map((r) => `- ${r}`).join("\n"))
    }

    return sections.join("\n\n---\n\n")
  }

  function parseYaml(text: string): Record<string, unknown> {
    // Simple YAML parser for our flat config format
    const result: Record<string, unknown> = {}
    const lines = text.split("\n")
    let section: string | undefined

    for (const line of lines) {
      const trimmed = line.trimEnd()
      if (!trimmed || trimmed.startsWith("#")) continue

      if (!trimmed.startsWith(" ") && !trimmed.startsWith("-") && trimmed.endsWith(":")) {
        section = trimmed.slice(0, -1)
        if (section === "custom") result[section] = []
        else result[section] = {}
        continue
      }

      if (section === "custom" && trimmed.trimStart().startsWith("- ")) {
        const value = trimmed.trimStart().slice(2).replace(/^["']|["']$/g, "")
        ;(result[section] as string[]).push(value)
        continue
      }

      if (section && trimmed.includes(":")) {
        const [key, ...rest] = trimmed.trimStart().split(":")
        const value = rest.join(":").trim()
        ;(result[section] as Record<string, unknown>)[key] = value === "true" ? true : value === "false" ? false : value
      }
    }

    return result
  }

  function toYaml(config: Config): string {
    const lines: string[] = ["standards:"]
    for (const [key, value] of Object.entries(config.standards)) {
      lines.push(`  ${key}: ${value}`)
    }
    if (config.custom.length > 0) {
      lines.push("", "custom:")
      for (const rule of config.custom) {
        lines.push(`  - "${rule}"`)
      }
    }
    return lines.join("\n") + "\n"
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/opencode && bun test test/agent/standards.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/agent/standards.ts packages/opencode/test/agent/standards.test.ts
git commit -m "feat: add quality standards config loader

Loads .humancode/standards.yml, falls back to defaults (clean + solid).
Builds review prompt by concatenating enabled standard markdown files."
```

### Task 3: Create review sub-agent

**Files:**
- Create: `packages/opencode/src/agent/prompt/review.txt`
- Modify: `packages/opencode/src/agent/agent.ts:77-227` — add `review` agent to registry

- [ ] **Step 1: Create review agent prompt**

```text
You are a code review agent. Your job is to review code changes against a set of quality standards.

You will receive:
1. A diff of the changes made
2. The quality standards to review against (injected below)

Review the diff against each enabled standard. For each violation found, report:
- The file path
- The line number
- Which standard group it violates
- Which specific rule within that group
- A brief explanation of why it's a violation

Be strict but practical. Only flag clear violations, not style preferences.

Output your verdict as JSON:
{
  "verdict": "pass" or "fail",
  "violations": [
    { "file": "path/to/file.ts", "line": 42, "standard": "clean", "rule": "naming", "explanation": "Variable name 'd' does not reveal intent" }
  ]
}

If there are no violations, return: { "verdict": "pass", "violations": [] }
```

- [ ] **Step 2: Register review agent in agent.ts**

Add after the `summary` agent definition at `packages/opencode/src/agent/agent.ts:226`:

```typescript
review: {
  name: "review",
  mode: "subagent",
  options: {},
  native: true,
  hidden: true,
  temperature: 0.1,
  permission: PermissionNext.merge(
    defaults,
    PermissionNext.fromConfig({
      "*": "deny",
      grep: "allow",
      glob: "allow",
      list: "allow",
      read: "allow",
    }),
    user,
  ),
  prompt: PROMPT_REVIEW,
},
```

Add import at top of file:
```typescript
import PROMPT_REVIEW from "./prompt/review.txt"
```

- [ ] **Step 3: Run existing agent tests to verify no regression**

Run: `cd packages/opencode && bun test test/agent/agent.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/agent/prompt/review.txt packages/opencode/src/agent/agent.ts
git commit -m "feat: add review sub-agent for quality standards checking

Read-only agent (temp 0.1) that reviews diffs against enabled
standards and returns structured pass/fail verdicts with violations."
```

---

## Chunk 2: Pair Mode Agent

### Task 4: Create pair agent prompt and register

**Files:**
- Create: `packages/opencode/src/agent/prompt/pair.txt`
- Modify: `packages/opencode/src/agent/agent.ts:77-227` — add `pair` agent

- [ ] **Step 1: Create pair agent prompt**

```text
You are a pair programming partner. Your role is to help the user write code by suggesting approaches, explaining trade-offs, and guiding their thinking. You never write implementation code yourself.

Rules:
1. NEVER produce code blocks intended to be copied into the codebase. You may use pseudocode, API signatures, or small illustrative snippets to explain concepts.
2. When given a task, analyze the codebase and break the approach into steps. For each step, explain what needs to change, where, and why.
3. Ask guiding questions to develop the user's thinking. Example: "What do you think happens if we put this logic in the controller instead?"
4. When the user shares code they've written, review it and offer feedback on correctness, style, and potential issues.
5. Suggest relevant patterns, existing utilities in the codebase, and potential pitfalls.
6. If the user is stuck, provide increasingly specific hints rather than jumping to the answer. Start with the general approach, then narrow down to the specific function/file, then to the specific logic.
7. Explain your reasoning. Don't just say "do X" — explain why X is the right approach and what alternatives you considered.
```

- [ ] **Step 2: Register pair agent in agent.ts**

Add to the agent registry in `packages/opencode/src/agent/agent.ts`:

```typescript
pair: {
  name: "pair",
  description: "Pair programming partner. Suggests approaches and explains trade-offs. Never writes code.",
  prompt: PROMPT_PAIR,
  temperature: 0.4,
  color: "#61AFEF",
  permission: PermissionNext.merge(
    defaults,
    PermissionNext.fromConfig({
      "*": "deny",
      grep: "allow",
      glob: "allow",
      list: "allow",
      read: "allow",
      websearch: "allow",
      webfetch: "allow",
    }),
    user,
  ),
  options: {},
  mode: "primary",
  native: true,
},
```

Add import:
```typescript
import PROMPT_PAIR from "./prompt/pair.txt"
```

- [ ] **Step 3: Write test for pair agent**

Add to `packages/opencode/test/agent/agent.test.ts`:

```typescript
test("pair agent is read-only", async () => {
  await using tmp = await tmpdir({ config: {} })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await Agent.get("pair")
      expect(agent).toBeDefined()
      expect(agent!.mode).toBe("primary")
      expect(agent!.temperature).toBe(0.4)
      // Verify edit tools are denied
      const editDenied = agent!.permission.some(
        (r) => r.permission === "*" && r.action === "deny"
      )
      expect(editDenied).toBe(true)
      const readAllowed = agent!.permission.some(
        (r) => r.permission === "read" && r.action === "allow"
      )
      expect(readAllowed).toBe(true)
    },
  })
})
```

- [ ] **Step 4: Run tests**

Run: `cd packages/opencode && bun test test/agent/agent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/agent/prompt/pair.txt packages/opencode/src/agent/agent.ts packages/opencode/test/agent/agent.test.ts
git commit -m "feat: add pair mode agent

Read-only agent that acts as a pair programming partner.
Suggests approaches and explains trade-offs, never writes code."
```

---

## Chunk 3: Vibe Mode Agent

### Task 5: Create vibe agent prompt and register

**Files:**
- Create: `packages/opencode/src/agent/prompt/vibe.txt`
- Modify: `packages/opencode/src/agent/agent.ts` — add `vibe` agent

- [ ] **Step 1: Create vibe agent prompt**

```text
You are a multi-task coding agent. You manage a queue of tasks and work through them sequentially, producing high-quality results for each.

Workflow:
1. When you receive a prompt, parse it into discrete tasks. If boundaries are ambiguous, ask the user to clarify.
2. Present the task list back to the user for confirmation before starting work.
3. For each task:
   a. Work through the implementation, spawning sub-agents (general, explore) as needed.
   b. After completing the task, generate a diff of your changes.
   c. Call the review sub-agent to check the diff against the project's quality standards.
   d. If the review finds violations, fix them and re-review (max 3 iterations).
   e. Move to the next task.
4. When all tasks are done, present a summary for each task: what was done, files changed, and any remaining review issues.

Error Recovery:
- If a task fails (crash, model error, unrecoverable error), note the failure with context and skip to the next task.
- Include all failures in the end-of-run summary so the user can re-queue them.

Each task runs in its own child session to keep diffs and history isolated.
```

- [ ] **Step 2: Register vibe agent**

Add to `packages/opencode/src/agent/agent.ts`:

```typescript
vibe: {
  name: "vibe",
  description: "Multi-task manager. Queues tasks, works through them with self-review, presents results.",
  prompt: PROMPT_VIBE,
  temperature: 0.3,
  color: "#98C379",
  steps: 100,
  permission: PermissionNext.merge(
    defaults,
    PermissionNext.fromConfig({
      question: "allow",
      plan_enter: "allow",
    }),
    user,
  ),
  options: {},
  mode: "primary",
  native: true,
},
```

Add import:
```typescript
import PROMPT_VIBE from "./prompt/vibe.txt"
```

- [ ] **Step 3: Write test for vibe agent**

Add to `packages/opencode/test/agent/agent.test.ts`:

```typescript
test("vibe agent has full tools and step limit", async () => {
  await using tmp = await tmpdir({ config: {} })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await Agent.get("vibe")
      expect(agent).toBeDefined()
      expect(agent!.mode).toBe("primary")
      expect(agent!.steps).toBe(100)
      expect(agent!.temperature).toBe(0.3)
    },
  })
})
```

- [ ] **Step 4: Run tests**

Run: `cd packages/opencode && bun test test/agent/agent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/agent/prompt/vibe.txt packages/opencode/src/agent/agent.ts packages/opencode/test/agent/agent.test.ts
git commit -m "feat: add vibe mode agent

Multi-task manager with self-review. Parses prompt into tasks,
works through them sequentially, reviews each against standards."
```

---

## Chunk 4: Claw Mode Agent

### Task 6: Create claw agent prompt and register

**Files:**
- Create: `packages/opencode/src/agent/prompt/claw.txt`
- Modify: `packages/opencode/src/agent/agent.ts` — add `claw` agent

- [ ] **Step 1: Create claw agent prompt**

```text
You are a fully autonomous coding agent. You receive a single prompt and work independently until the task is complete, with no human checkpoints.

Workflow:
1. Plan the implementation — break the goal into concrete steps.
2. Execute each step: write code, write tests, run tests.
3. After implementation is complete, enter the self-review loop:
   a. Generate a full diff of all changes.
   b. Call the review sub-agent to check against quality standards.
   c. If violations found, fix them.
   d. Re-review (max 3 iterations).
   e. Run tests again to confirm fixes didn't break anything.
4. Present the final result: summary, diff, test results, review verdict.

If you reach your step limit without completing the work, stop and present a partial summary of what was completed and what remains.

You have full permissions — do not ask for confirmation on file writes, edits, or bash commands. The only exceptions:
- Force push
- File deletion outside the project directory
- Modifying .env files

Quality standards will be injected into your context. Follow them rigorously.
```

- [ ] **Step 2: Register claw agent**

Add to `packages/opencode/src/agent/agent.ts`:

```typescript
claw: {
  name: "claw",
  description: "Fully autonomous agent. Single prompt, self-reviews against quality standards.",
  prompt: PROMPT_CLAW,
  temperature: 0.2,
  color: "#C678DD",
  steps: 500,
  permission: PermissionNext.merge(
    defaults,
    PermissionNext.fromConfig({
      "*": "allow",
      question: "allow",
      plan_enter: "allow",
    }),
    user,
  ),
  options: {},
  mode: "primary",
  native: true,
},
```

Add import:
```typescript
import PROMPT_CLAW from "./prompt/claw.txt"
```

- [ ] **Step 3: Write test for claw agent**

Add to `packages/opencode/test/agent/agent.test.ts`:

```typescript
test("claw agent has high step limit and full permissions", async () => {
  await using tmp = await tmpdir({ config: {} })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const agent = await Agent.get("claw")
      expect(agent).toBeDefined()
      expect(agent!.mode).toBe("primary")
      expect(agent!.steps).toBe(500)
      expect(agent!.temperature).toBe(0.2)
      // Verify broad permissions
      const allAllow = agent!.permission.some(
        (r) => r.permission === "*" && r.action === "allow"
      )
      expect(allAllow).toBe(true)
    },
  })
})
```

- [ ] **Step 4: Run tests**

Run: `cd packages/opencode && bun test test/agent/agent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/agent/prompt/claw.txt packages/opencode/src/agent/agent.ts packages/opencode/test/agent/agent.test.ts
git commit -m "feat: add claw mode agent

Fully autonomous agent with 500-step limit. Self-reviews against
quality standards. All permissions allowed by default."
```

---

## Chunk 5: Complexity Assessor

### Task 7: Implement the complexity assessor

**Files:**
- Create: `packages/opencode/src/agent/assessor.ts`
- Test: `packages/opencode/test/agent/assessor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/opencode/test/agent/assessor.test.ts
import { test, expect, describe } from "bun:test"
import { Assessor } from "../../src/agent/assessor"

describe("Assessor", () => {
  describe("prompt analysis", () => {
    test("detects learning intent", () => {
      const result = Assessor.analyze("explain how the auth system works")
      expect(result.mode).toBe("pair")
    })

    test("detects multiple tasks", () => {
      const result = Assessor.analyze("fix the lint warnings and add tests for session.ts")
      expect(result.mode).toBe("vibe")
    })

    test("low complexity routes to claw", () => {
      const result = Assessor.analyze("add a loading spinner to settings page")
      expect(result.mode).toBe("claw")
    })

    test("high complexity routes to debug", () => {
      const result = Assessor.analyze(
        "refactor the entire authentication module to support role-based access control across all packages"
      )
      expect(result.mode).toBe("debug")
    })

    test("returns confidence score", () => {
      const result = Assessor.analyze("fix a typo in README")
      expect(result.confidence).toBeGreaterThan(0)
      expect(result.confidence).toBeLessThanOrEqual(100)
    })

    test("returns human-readable reason", () => {
      const result = Assessor.analyze("explain the provider system")
      expect(result.reason).toContain("pair")
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/opencode && bun test test/agent/assessor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the assessor**

```typescript
// packages/opencode/src/agent/assessor.ts
export namespace Assessor {
  export type Result = {
    mode: "pair" | "debug" | "vibe" | "claw"
    confidence: number
    reason: string
    complexity: number
  }

  const LEARNING_KEYWORDS = ["explain", "understand", "walk me through", "why does", "how does", "help me learn", "teach me"]
  const LOW_KEYWORDS: Record<string, number> = { fix: 2, typo: 2, rename: 2, update: 2, change: 2 }
  const MED_KEYWORDS: Record<string, number> = { add: 5, implement: 5, create: 5 }
  const HIGH_KEYWORDS: Record<string, number> = { refactor: 10, redesign: 10, rewrite: 10, rebuild: 10, migrate: 10 }
  const TASK_SPLITTERS = /\band\b|;|\d+\.\s|\n-\s|\n\*\s/g

  export function analyze(prompt: string): Result {
    const lower = prompt.toLowerCase()

    // Priority 1: Learning intent
    if (LEARNING_KEYWORDS.some((k) => lower.includes(k))) {
      return { mode: "pair", confidence: 90, reason: "Learning intent detected — recommending pair mode", complexity: 0 }
    }

    // Priority 2: Multiple tasks
    const tasks = prompt.split(TASK_SPLITTERS).filter((t) => t.trim().length > 10)
    if (tasks.length >= 2) {
      return {
        mode: "vibe",
        confidence: 85,
        reason: `${tasks.length} tasks detected — recommending vibe mode`,
        complexity: 0,
      }
    }

    // Compute complexity score
    const scope = scopeWeight(lower)
    const specificity = specificityAdjustment(lower)
    const complexity = scope + specificity

    // Priority 3-5: Complexity-based
    if (complexity < 15) {
      const margin = Math.min(Math.abs(complexity - 15), Math.abs(complexity - 30))
      const confidence = Math.min(95, 50 + margin * 3)
      return { mode: "claw", confidence, reason: "Low complexity — recommending claw mode", complexity }
    }
    if (complexity <= 30) {
      const margin = Math.min(Math.abs(complexity - 15), Math.abs(complexity - 30))
      const confidence = Math.min(95, 50 + margin * 3)
      return { mode: "vibe", confidence, reason: "Moderate complexity — recommending vibe mode", complexity }
    }

    const margin = Math.abs(complexity - 30)
    const confidence = Math.min(95, 50 + margin * 3)
    return { mode: "debug", confidence, reason: "High complexity — recommending debug mode", complexity }
  }

  function scopeWeight(text: string): number {
    const words = text.split(/\s+/)
    let max = 2 // default low
    for (const word of words) {
      if (HIGH_KEYWORDS[word] !== undefined) max = Math.max(max, HIGH_KEYWORDS[word])
      else if (MED_KEYWORDS[word] !== undefined) max = Math.max(max, MED_KEYWORDS[word])
      else if (LOW_KEYWORDS[word] !== undefined) max = Math.max(max, LOW_KEYWORDS[word])
    }
    return max
  }

  function specificityAdjustment(text: string): number {
    // Count file/function references (paths with / or . extensions)
    const refs = text.match(/[\w/]+\.\w{1,4}\b/g)
    if (refs && refs.length > 0) return refs.length * -2
    return 5 // vague prompt penalty
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/opencode && bun test test/agent/assessor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/agent/assessor.ts packages/opencode/test/agent/assessor.test.ts
git commit -m "feat: add complexity assessor for auto-mode selection

Heuristic function that analyzes prompt signals (learning intent,
task count, scope keywords, specificity) to recommend a mode.
Returns mode, confidence score, and reason."
```

---

## Chunk 6: Session Mode Persistence

### Task 8: Add mode column to session table

**Files:**
- Modify: `packages/opencode/src/session/session.sql.ts:11-35` — add `mode` column
- Create: `packages/opencode/migration/<timestamp>_add_session_mode/migration.sql`
- Modify: `packages/opencode/src/session/index.ts` — expose mode in session info

- [ ] **Step 1: Add mode column to SessionTable schema**

In `packages/opencode/src/session/session.sql.ts`, add after `time_archived`:

```typescript
mode: text(),
```

- [ ] **Step 2: Create migration**

Create directory `packages/opencode/migration/20260402000000_add_session_mode/` and file `migration.sql`:

```sql
ALTER TABLE session ADD COLUMN mode text;
```

- [ ] **Step 3: Verify migration applies**

Run: `cd packages/opencode && bun dev` (briefly, then Ctrl+C)
Check logs for "applying migrations" with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/session/session.sql.ts packages/opencode/migration/20260402000000_add_session_mode/
git commit -m "feat: add mode column to session table

Stores the selected automation mode (pair/debug/vibe/claw) per session.
Null means auto-select on next prompt."
```

---

## Chunk 7: TUI Mode Badge and Tab Cycling

### Task 9: Update Tab cycling order

**Files:**
- Modify: `packages/opencode/src/agent/agent.ts:281-288` — update `list()` sort to enforce mode order
- Modify: `packages/opencode/src/cli/cmd/tui/context/local.tsx:36-93` — update agent list filtering

The existing Tab cycling uses `agent.list()` which sorts agents. We need to ensure the order is: pair, debug, vibe, claw.

- [ ] **Step 1: Update Agent.list() to enforce mode order**

In `packages/opencode/src/agent/agent.ts`, modify the `list()` function:

```typescript
const MODE_ORDER: Record<string, number> = { pair: 0, debug: 1, vibe: 2, claw: 3 }

export async function list() {
  const cfg = await Config.get()
  return pipe(
    await state(),
    values(),
    sortBy([
      (x) => MODE_ORDER[x.name] ?? 99,
      "asc",
    ]),
  )
}
```

- [ ] **Step 2: Run agent tests**

Run: `cd packages/opencode && bun test test/agent/agent.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/opencode/src/agent/agent.ts
git commit -m "feat: enforce pair/debug/vibe/claw Tab cycling order

Agent.list() now sorts by predefined mode order instead of
default agent preference."
```

### Task 10: Add mode badge to TUI status bar

**Files:**
- Modify: `packages/opencode/src/cli/cmd/tui/routes/session/header.tsx` — add mode badge

- [ ] **Step 1: Read the current header component**

Read `packages/opencode/src/cli/cmd/tui/routes/session/header.tsx` to understand the layout.

- [ ] **Step 2: Add mode badge**

Add a colored badge showing the current mode name (e.g., `PAIR`, `DEBUG`, `VIBE`, `CLAW`) next to the session title in the header. Use the agent's color property for the badge background.

The exact implementation depends on the current header layout — look for where the title is rendered and add the badge adjacent to it:

```tsx
<text fg={agent.color(local.agent.current().name)}>
  {local.agent.current().name.toUpperCase()}
</text>
```

- [ ] **Step 3: Add toast on mode switch**

In `packages/opencode/src/cli/cmd/tui/context/local.tsx`, modify `agent.move()` to show a toast:

```typescript
move(direction: 1 | -1) {
  batch(() => {
    let next = agents().findIndex((x) => x.name === agentStore.current) + direction
    if (next < 0) next = agents().length - 1
    if (next >= agents().length) next = 0
    const value = agents()[next]
    setAgentStore("current", value.name)
    toast.show({
      variant: "info",
      message: `Switched to ${value.name.toUpperCase()} mode`,
      duration: 2000,
    })
  })
},
```

- [ ] **Step 4: Verify visually**

Run: `cd packages/opencode && bun dev .`
Press Tab to cycle through modes. Verify:
- Badge color changes
- Toast appears
- Order is pair -> debug -> vibe -> claw

- [ ] **Step 5: Commit**

```bash
git add packages/opencode/src/cli/cmd/tui/routes/session/header.tsx packages/opencode/src/cli/cmd/tui/context/local.tsx
git commit -m "feat: add mode badge to TUI and toast on Tab switch

Shows colored mode name in session header. Toast notification
on mode switch: 'Switched to VIBE mode'."
```

---

## Chunk 8: Assessor Integration

### Task 11: Wire assessor into prompt flow

**Files:**
- Modify: `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx` — run assessor on prompt submit
- Modify: `packages/opencode/src/cli/cmd/tui/context/local.tsx` — add assessor recommendation display

- [ ] **Step 1: Import assessor in prompt component**

In the prompt component, when the user submits a prompt and no explicit mode has been selected (i.e., user hasn't pressed Tab), run the assessor:

```typescript
import { Assessor } from "@/agent/assessor"

// Before sending the prompt:
const result = Assessor.analyze(promptText)
agent.set(result.mode)
// Display recommendation as a system message or inline note
```

- [ ] **Step 2: Display recommendation inline**

Show the assessor's recommendation as a one-line message above the response:

```
Recommending claw mode — single file change, tests exist. Confidence: 91%. Override with Tab.
```

The exact rendering depends on the prompt component's message display — add a system-style message.

- [ ] **Step 3: Verify visually**

Run: `cd packages/opencode && bun dev .`
Type a prompt without pressing Tab. Verify:
- Assessor recommends a mode
- Recommendation is displayed
- Agent switches to recommended mode
- Tab still overrides

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx packages/opencode/src/cli/cmd/tui/context/local.tsx
git commit -m "feat: wire complexity assessor into prompt flow

Auto-selects mode on prompt submit. Shows recommendation with
confidence score. Tab overrides at any time."
```

---

## Chunk 9: First-Run Standards Dialog

### Task 12: Create standards selection dialog

**Files:**
- Create: `packages/opencode/src/cli/cmd/tui/component/dialog-standards.tsx`
- Modify: `packages/opencode/src/cli/cmd/tui/app.tsx` — register standards dialog

- [ ] **Step 1: Create the dialog component**

```tsx
// packages/opencode/src/cli/cmd/tui/component/dialog-standards.tsx
import { createSignal, For } from "solid-js"
import { Standards } from "@/agent/standards"
import { useLocal } from "@tui/context/local"

const CATALOG = [
  { key: "clean", label: "Clean Code Foundations", description: "Naming, functions, structure, error handling" },
  { key: "solid", label: "SOLID Principles", description: "SRP, OCP, LSP, ISP, DIP" },
  { key: "oop", label: "Elegant Objects (OOP)", description: "Immutable objects, no static/nulls/getters" },
  { key: "bob", label: "Clean Code (Bob Martin)", description: "Functions <20 lines, Law of Demeter, TDD" },
  { key: "typescript_react", label: "TypeScript & React", description: "Tailwind-only, named params, strong types" },
  { key: "ddd", label: "Domain-Driven Design", description: "Aggregates, bounded contexts, domain events" },
] as const

export function DialogStandards(props: { onConfirm: (config: Standards.Config) => void }) {
  const [selected, setSelected] = createSignal<Record<string, boolean>>({
    clean: true,
    solid: true,
    oop: false,
    bob: false,
    typescript_react: false,
    ddd: false,
  })

  function toggle(key: string) {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function confirm() {
    props.onConfirm({
      standards: selected() as Standards.Config["standards"],
      custom: [],
    })
  }

  // Render checkbox list using the TUI dialog patterns from existing dialogs
  // Follow the pattern in dialog-agent.tsx for layout
}
```

- [ ] **Step 2: Wire dialog into vibe/claw mode activation**

When switching to vibe or claw mode, check if `.humancode/standards.yml` exists. If not, show the dialog before proceeding.

- [ ] **Step 3: Verify visually**

Run: `cd packages/opencode && bun dev .`
Press Tab to switch to vibe mode in a project without `.humancode/standards.yml`. Verify the dialog appears.

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/cli/cmd/tui/component/dialog-standards.tsx packages/opencode/src/cli/cmd/tui/app.tsx
git commit -m "feat: add first-run standards selection dialog

Presents quality standards catalog when entering vibe/claw mode
without a .humancode/standards.yml. Generates config on confirmation."
```

---

## Chunk 10: Hide build and plan from Tab cycle

### Task 13: Remove build and plan from primary Tab cycling

**Files:**
- Modify: `packages/opencode/src/agent/agent.ts:101-138` — set `build` and `plan` to hidden

- [ ] **Step 1: Hide build and plan agents**

In `packages/opencode/src/agent/agent.ts`, add `hidden: true` to both the `build` (line ~101) and `plan` (line ~116) agent definitions:

```typescript
build: {
  name: "build",
  description: "The default agent. Executes tools based on configured permissions.",
  hidden: true,  // <-- add this
  // ... rest unchanged
},
plan: {
  name: "plan",
  description: "Plan mode. Disallows all edit tools.",
  hidden: true,  // <-- add this
  // ... rest unchanged
},
```

They remain accessible via the command palette (`DialogAgent`) but won't appear in Tab cycling.

- [ ] **Step 2: Update default agent**

In `packages/opencode/src/agent/agent.ts`, update `defaultAgent()` to return `"debug"` instead of searching for the first visible primary agent (since `build` is now hidden):

The existing logic at line 302 already handles this — it finds the first non-subagent, non-hidden agent. With our MODE_ORDER sort, `pair` will be first. This is correct.

- [ ] **Step 3: Run tests and fix any failures**

Run: `cd packages/opencode && bun test test/agent/agent.test.ts`
Fix any tests that assert on `build` or `plan` being visible.

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/agent/agent.ts packages/opencode/test/agent/agent.test.ts
git commit -m "feat: hide build and plan agents from Tab cycle

build and plan are replaced by the four modes (pair, debug, vibe, claw)
but remain accessible via command palette for backwards compatibility."
```

---

## Chunk 11: Integration Testing

### Task 14: End-to-end mode verification

**Files:**
- Create: `packages/opencode/test/agent/modes.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
// packages/opencode/test/agent/modes.test.ts
import { test, expect, describe } from "bun:test"
import { Agent } from "../../src/agent/agent"
import { Assessor } from "../../src/agent/assessor"
import { Standards } from "../../src/agent/standards"
import { tmpdir } from "../util/tmpdir"
import { Instance } from "../../src/project/instance"

describe("Multi-mode integration", () => {
  test("all four modes are registered as primary agents", async () => {
    await using tmp = await tmpdir({ config: {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agents = await Agent.list()
        const primary = agents.filter((a) => a.mode !== "subagent" && !a.hidden)
        const names = primary.map((a) => a.name)
        expect(names).toContain("pair")
        expect(names).toContain("debug")
        expect(names).toContain("vibe")
        expect(names).toContain("claw")
        expect(names).not.toContain("build")
        expect(names).not.toContain("plan")
      },
    })
  })

  test("Tab cycle order is pair, debug, vibe, claw", async () => {
    await using tmp = await tmpdir({ config: {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agents = await Agent.list()
        const visible = agents.filter((a) => a.mode !== "subagent" && !a.hidden)
        expect(visible[0].name).toBe("pair")
        expect(visible[1].name).toBe("debug")
        expect(visible[2].name).toBe("vibe")
        expect(visible[3].name).toBe("claw")
      },
    })
  })

  test("review agent is registered as hidden subagent", async () => {
    await using tmp = await tmpdir({ config: {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agent = await Agent.get("review")
        expect(agent).toBeDefined()
        expect(agent!.mode).toBe("subagent")
        expect(agent!.hidden).toBe(true)
      },
    })
  })

  test("assessor integrates with agent registry", async () => {
    await using tmp = await tmpdir({ config: {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = Assessor.analyze("explain how providers work")
        const agent = await Agent.get(result.mode)
        expect(agent).toBeDefined()
        expect(agent!.name).toBe("pair")
      },
    })
  })

  test("standards prompt loads for review agent", async () => {
    const config = { standards: { clean: true, solid: true, oop: false, bob: false, typescript_react: false, ddd: false }, custom: [] }
    const prompt = await Standards.prompt(config)
    expect(prompt).toContain("Clean Code Foundations")
    expect(prompt).toContain("SOLID Principles")
    expect(prompt.length).toBeGreaterThan(100)
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `cd packages/opencode && bun test test/agent/`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add packages/opencode/test/agent/modes.test.ts
git commit -m "test: add integration tests for multi-mode system

Verifies all four modes registered, Tab cycle order, review agent,
assessor integration, and standards prompt loading."
```

### Task 15: Manual TUI verification

- [ ] **Step 1: Run the TUI**

Run: `cd packages/opencode && bun dev .`

- [ ] **Step 2: Verify the following:**
- Mode badge visible in header
- Tab cycles: pair -> debug -> vibe -> claw -> pair
- Toast shows on mode switch
- Type "explain how X works" — assessor recommends pair
- Type "fix the typo in README" — assessor recommends claw
- Type "fix A and add B and update C" — assessor recommends vibe

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during manual TUI verification"
```
