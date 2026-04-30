# Go Debugger Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Go debug adapter to `packages/debugger` that drives Delve over DAP, supports `dlv debug` and `dlv test` modes (auto-detected from `_test.go` suffix, with `goMode` override), and integrates via the existing adapter registry.

**Architecture:** New `GoAdapter` class implementing `DebugAdapter`, modeled directly on `PythonAdapter`. Reuses `DapClient` (TCP) and `findFreePort`/`waitForPort` helpers. Spawns `dlv dap --listen=...` and exchanges DAP messages. Pure helper functions (`resolveGoMode`, `resolveDlvBinary`) are extracted so the testable logic can be unit-tested without spawning Delve. Two-line registry change wires it up.

**Tech Stack:** TypeScript, Bun runtime, `child_process.spawn`, Delve (`dlv`), DAP over TCP, Bun's built-in test runner (`bun test`).

**Spec:** `docs/superpowers/specs/2026-04-30-go-debugger-adapter-design.md`

---

## File Structure

**New files:**
- `packages/debugger/src/adapter/go.ts` — `GoAdapter` class + exported helpers `resolveGoMode`, `resolveDlvBinary`.
- `packages/debugger/test/adapter/go.test.ts` — unit tests for the pure helpers.
- `packages/debugger/test/fixtures/go/go.mod` — minimal Go module for smoke test.
- `packages/debugger/test/fixtures/go/main.go` — small program with a clear breakpoint location.
- `packages/debugger/test/fixtures/go/main_test.go` — passing + failing test for `_test.go` mode detection.
- `packages/debugger/test/manual/go-smoke.ts` — manual end-to-end smoke harness.

**Modified files:**
- `packages/debugger/src/adapter/base.ts` — extend `LaunchConfig` with `dlvPath`, `goMode`, `buildFlags`, `testFilter`.
- `packages/debugger/src/adapter/registry.ts` — register `GoAdapter`; add `.go` to `detectType`.
- `packages/debugger/package.json` — add a `test` script.

---

## Task 1: Extend LaunchConfig with Go fields

**Files:**
- Modify: `packages/debugger/src/adapter/base.ts:8-18`

- [ ] **Step 1: Extend the `LaunchConfig` interface**

Replace the existing `LaunchConfig` interface in `packages/debugger/src/adapter/base.ts` (lines 8-18) with:

```ts
export interface LaunchConfig {
  type: string // "node" | "python" | "go"
  program: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  runtimeExecutable?: string // e.g. "bun", "tsx"
  runtimeArgs?: string[]
  pythonPath?: string
  module?: string // python -m module

  // Go-specific
  dlvPath?: string // override path to `dlv` binary
  goMode?: "debug" | "test" // override _test.go auto-detection
  buildFlags?: string // passed to dlv `--build-flags`
  testFilter?: string // passed as args after `--`, e.g. "-test.run=TestFoo"
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd packages/debugger && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/debugger/src/adapter/base.ts
git commit -m "feat(debugger): extend LaunchConfig with Go-specific fields"
```

---

## Task 2: Add a `test` script and verify Bun's test runner runs

**Files:**
- Modify: `packages/debugger/package.json:9`

- [ ] **Step 1: Add the test script**

In `packages/debugger/package.json`, change the `scripts` block from:

```json
"scripts": { "typecheck": "tsc --noEmit", "start": "bun run src/index.ts" },
```

to:

```json
"scripts": {
  "typecheck": "tsc --noEmit",
  "start": "bun run src/index.ts",
  "test": "bun test"
},
```

- [ ] **Step 2: Create a placeholder test file to confirm runner works**

Create `packages/debugger/test/adapter/go.test.ts` with:

```ts
import { describe, it, expect } from "bun:test"

describe("GoAdapter helpers", () => {
  it("placeholder — runner is wired up", () => {
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 3: Run the test to confirm Bun finds it**

Run: `cd packages/debugger && bun test`
Expected: 1 test passes, output mentions `test/adapter/go.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/debugger/package.json packages/debugger/test/adapter/go.test.ts
git commit -m "chore(debugger): add bun test script and placeholder go adapter test"
```

---

## Task 3: TDD `resolveGoMode` helper

**Files:**
- Modify: `packages/debugger/test/adapter/go.test.ts`
- Create: `packages/debugger/src/adapter/go.ts` (skeleton)

- [ ] **Step 1: Write the failing tests**

Replace the contents of `packages/debugger/test/adapter/go.test.ts` with:

```ts
import { describe, it, expect } from "bun:test"
import { resolveGoMode } from "../../src/adapter/go"

describe("resolveGoMode", () => {
  it("returns 'test' when program ends with _test.go", () => {
    expect(resolveGoMode({ type: "go", program: "foo_test.go" })).toBe("test")
    expect(
      resolveGoMode({ type: "go", program: "/abs/path/bar_test.go" }),
    ).toBe("test")
  })

  it("returns 'debug' for non-test .go files", () => {
    expect(resolveGoMode({ type: "go", program: "main.go" })).toBe("debug")
  })

  it("returns 'debug' for package paths without .go suffix", () => {
    expect(resolveGoMode({ type: "go", program: "./cmd/server" })).toBe(
      "debug",
    )
  })

  it("respects an explicit goMode override", () => {
    expect(
      resolveGoMode({ type: "go", program: "foo_test.go", goMode: "debug" }),
    ).toBe("debug")
    expect(
      resolveGoMode({ type: "go", program: "main.go", goMode: "test" }),
    ).toBe("test")
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd packages/debugger && bun test`
Expected: FAIL with `Cannot find module '../../src/adapter/go'`.

- [ ] **Step 3: Create the minimal go.ts to make `resolveGoMode` pass**

Create `packages/debugger/src/adapter/go.ts` with:

```ts
import type { LaunchConfig } from "./base"

/**
 * Decide whether to run dlv in `debug` or `test` mode.
 *
 * Rules:
 * 1. If config.goMode is set, use it.
 * 2. Else if program ends in `_test.go`, return "test".
 * 3. Else return "debug".
 *
 * Note: A Go *package path* (e.g. "./cmd/server") cannot be auto-classified
 * as a test target — pass goMode: "test" explicitly if you mean to test it.
 */
export function resolveGoMode(config: LaunchConfig): "debug" | "test" {
  if (config.goMode) return config.goMode
  if (config.program.endsWith("_test.go")) return "test"
  return "debug"
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `cd packages/debugger && bun test`
Expected: all 4 `resolveGoMode` tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/debugger/src/adapter/go.ts packages/debugger/test/adapter/go.test.ts
git commit -m "feat(debugger): add resolveGoMode helper with _test.go auto-detection"
```

---

## Task 4: TDD `resolveDlvBinary` helper

**Files:**
- Modify: `packages/debugger/test/adapter/go.test.ts`
- Modify: `packages/debugger/src/adapter/go.ts`

- [ ] **Step 1: Add failing tests**

Append to `packages/debugger/test/adapter/go.test.ts` (before the closing of the file, but as a new top-level `describe`):

```ts
import { resolveDlvBinary } from "../../src/adapter/go"

describe("resolveDlvBinary", () => {
  it("returns config.dlvPath verbatim when provided", () => {
    expect(resolveDlvBinary({ dlvPath: "/custom/path/to/dlv" })).toBe(
      "/custom/path/to/dlv",
    )
  })

  it("returns 'dlv' when no override and binary is on PATH", () => {
    // Simulate PATH lookup with an injected resolver.
    const resolver = (name: string) => (name === "dlv" ? "/usr/local/bin/dlv" : null)
    expect(resolveDlvBinary({}, resolver)).toBe("/usr/local/bin/dlv")
  })

  it("throws with install instructions when dlv is missing from PATH", () => {
    const resolver = () => null
    expect(() => resolveDlvBinary({}, resolver)).toThrow(
      /go install github\.com\/go-delve\/delve\/cmd\/dlv@latest/,
    )
  })
})
```

- [ ] **Step 2: Run tests — verify the new ones fail**

Run: `cd packages/debugger && bun test`
Expected: FAIL with `resolveDlvBinary` is not exported (or similar). The 4 `resolveGoMode` tests should still pass.

- [ ] **Step 3: Implement `resolveDlvBinary` in go.ts**

Append to `packages/debugger/src/adapter/go.ts`:

```ts
type PathResolver = (name: string) => string | null

/**
 * Resolve the path to the `dlv` binary.
 *
 * - If `dlvPath` is provided, return it verbatim (caller is responsible for it).
 * - Otherwise look up `dlv` on PATH via the supplied resolver (defaults to Bun.which).
 * - If absent, throw with install instructions.
 *
 * The resolver is injectable for testability; production callers omit it.
 */
export function resolveDlvBinary(
  opts: { dlvPath?: string },
  resolver: PathResolver = (name) => Bun.which(name),
): string {
  if (opts.dlvPath) return opts.dlvPath
  const found = resolver("dlv")
  if (found) return found
  throw new Error(
    "Delve (dlv) not found on PATH. Install with:\n" +
      "  go install github.com/go-delve/delve/cmd/dlv@latest\n" +
      "Or pass dlvPath in the launch config.",
  )
}
```

- [ ] **Step 4: Run tests — verify all pass**

Run: `cd packages/debugger && bun test`
Expected: 7 tests pass (4 `resolveGoMode` + 3 `resolveDlvBinary`).

- [ ] **Step 5: Commit**

```bash
git add packages/debugger/src/adapter/go.ts packages/debugger/test/adapter/go.test.ts
git commit -m "feat(debugger): add resolveDlvBinary helper with install-instruction error"
```

---

## Task 5: Implement `GoAdapter.start` (process launch + DAP handshake)

**Files:**
- Modify: `packages/debugger/src/adapter/go.ts`

- [ ] **Step 1: Add imports and class skeleton**

At the top of `packages/debugger/src/adapter/go.ts`, add the imports (above the existing `import type { LaunchConfig }` line):

```ts
import { spawn, type ChildProcess } from "child_process"
import type { SourceBreakpoint, StackFrame, Variable } from "../dap/types"
import type {
  BreakpointResult,
  DebugAdapter,
  EvalResult,
  StopResult,
  StoppedInfo,
} from "./base"
import { DapClient } from "../dap/client"
import { findFreePort, waitForPort } from "../util/port"
```

Then, at the bottom of the file, add the class skeleton:

```ts
const WAIT_TIMEOUT = 30_000

/**
 * Go debug adapter using Delve's DAP server (`dlv dap`) over TCP.
 *
 * Auto-detects test mode from `_test.go` filenames; pass `goMode` to override.
 * Does NOT support `dlv exec` or `dlv attach` modes — out of scope for v1.
 */
export class GoAdapter implements DebugAdapter {
  readonly id = "go"
  private process: ChildProcess | null = null
  private client: DapClient | null = null
  private stoppedCallbacks: ((event: StoppedInfo) => void)[] = []
  private threadId = 1
  private frameIds: number[] = []
  private initialPausePromise: Promise<StopResult> | null = null
  private stderrBuffer = ""

  async start(config: LaunchConfig): Promise<void> {
    const dlvPath = resolveDlvBinary({ dlvPath: config.dlvPath })
    const mode = resolveGoMode(config)
    const port = await findFreePort()

    this.process = spawn(
      dlvPath,
      ["dap", "--listen", `127.0.0.1:${port}`],
      {
        cwd: config.cwd,
        env: { ...process.env, ...config.env },
        stdio: ["pipe", "pipe", "pipe"],
      },
    )

    this.process.stderr?.on("data", (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString()
    })

    this.process.on("error", (err) => {
      console.error(`[go-adapter] Process error: ${err.message}`)
    })

    try {
      await waitForPort(port)
    } catch (err) {
      const tail = this.stderrBuffer.trim().split("\n").slice(-5).join("\n")
      throw new Error(
        `dlv dap failed to start on port ${port}.${tail ? `\nstderr:\n${tail}` : ""}`,
      )
    }

    this.client = new DapClient("127.0.0.1", port)
    await this.client.connect()

    this.client.on("stopped", (body) => {
      this.threadId = (body.threadId as number) ?? 1
      const info: StoppedInfo = {
        reason: (body.reason as string) ?? "breakpoint",
        threadId: this.threadId,
        description: body.description as string | undefined,
      }
      for (const cb of this.stoppedCallbacks) cb(info)
    })

    this.initialPausePromise = this.waitForStop()

    await this.client.sendRequest("initialize", {
      clientID: "opencode-debugger",
      clientName: "OpenCode Debugger",
      adapterID: "go",
      pathFormat: "path",
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsRunInTerminalRequest: false,
    })

    const launchArgs = [
      ...(config.args ?? []),
      ...(config.testFilter ? ["--", config.testFilter] : []),
    ]

    await this.client.sendRequest("launch", {
      type: "go",
      request: "launch",
      mode,
      program: config.program,
      args: launchArgs,
      cwd: config.cwd ?? process.cwd(),
      env: config.env,
      buildFlags: config.buildFlags,
      stopOnEntry: true,
    })

    await this.client.sendRequest("configurationDone", {})
  }

  async waitForInitialPause(): Promise<StopResult> {
    if (!this.initialPausePromise) {
      return { reason: "entry", location: undefined }
    }
    const result = await this.initialPausePromise
    this.initialPausePromise = null
    return result
  }

  // [DAP pass-through methods filled in by Task 6]
  setBreakpoints(_file: string, _bps: SourceBreakpoint[]): Promise<BreakpointResult[]> {
    throw new Error("not implemented")
  }
  continue(_threadId?: number): Promise<StopResult> { throw new Error("not implemented") }
  stepOver(_threadId?: number): Promise<StopResult> { throw new Error("not implemented") }
  stepIn(_threadId?: number): Promise<StopResult> { throw new Error("not implemented") }
  stepOut(_threadId?: number): Promise<StopResult> { throw new Error("not implemented") }
  getCallStack(_threadId?: number): Promise<StackFrame[]> { throw new Error("not implemented") }
  getVariables(_frameId?: number, _scope?: string, _maxDepth?: number): Promise<Variable[]> {
    throw new Error("not implemented")
  }
  evaluate(_expression: string, _frameId?: number): Promise<EvalResult> {
    throw new Error("not implemented")
  }
  disconnect(): Promise<void> { throw new Error("not implemented") }
  onStopped(cb: (event: StoppedInfo) => void): void {
    this.stoppedCallbacks.push(cb)
  }

  private waitForStop(): Promise<StopResult> {
    return Promise.resolve({ reason: "entry" })
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd packages/debugger && bun run typecheck`
Expected: no errors. (Tests will still pass — pure helpers are unchanged.)

- [ ] **Step 3: Run tests**

Run: `cd packages/debugger && bun test`
Expected: 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/debugger/src/adapter/go.ts
git commit -m "feat(debugger): add GoAdapter with dlv dap launch (DAP methods stubbed)"
```

---

## Task 6: Fill in DAP pass-through methods

**Files:**
- Modify: `packages/debugger/src/adapter/go.ts`

- [ ] **Step 1: Replace the stub method block with real implementations**

In `packages/debugger/src/adapter/go.ts`, replace the comment `// [DAP pass-through methods filled in by Task 6]` and the eight stub methods that follow it (through `disconnect()`) with:

```ts
async setBreakpoints(
  file: string,
  breakpoints: SourceBreakpoint[],
): Promise<BreakpointResult[]> {
  if (!this.client) throw new Error("Not connected")

  const response = await this.client.sendRequest("setBreakpoints", {
    source: { path: file },
    breakpoints: breakpoints.map((bp) => ({
      line: bp.line,
      column: bp.column,
      condition: bp.condition,
      hitCondition: bp.hitCondition,
      logMessage: bp.logMessage,
    })),
  })

  const body = response.body ?? {}
  const bps = (body.breakpoints ?? []) as any[]
  return bps.map((bp: any) => ({
    id: bp.id,
    verified: bp.verified ?? false,
    line: bp.line,
    message: bp.message,
  }))
}

async continue(threadId?: number): Promise<StopResult> {
  if (!this.client) throw new Error("Not connected")
  const stopPromise = this.waitForStop()
  await this.client.sendRequest("continue", { threadId: threadId ?? this.threadId })
  return stopPromise
}

async stepOver(threadId?: number): Promise<StopResult> {
  if (!this.client) throw new Error("Not connected")
  const stopPromise = this.waitForStop()
  await this.client.sendRequest("next", { threadId: threadId ?? this.threadId })
  return stopPromise
}

async stepIn(threadId?: number): Promise<StopResult> {
  if (!this.client) throw new Error("Not connected")
  const stopPromise = this.waitForStop()
  await this.client.sendRequest("stepIn", { threadId: threadId ?? this.threadId })
  return stopPromise
}

async stepOut(threadId?: number): Promise<StopResult> {
  if (!this.client) throw new Error("Not connected")
  const stopPromise = this.waitForStop()
  await this.client.sendRequest("stepOut", { threadId: threadId ?? this.threadId })
  return stopPromise
}

async getCallStack(threadId?: number): Promise<StackFrame[]> {
  if (!this.client) throw new Error("Not connected")

  const response = await this.client.sendRequest("stackTrace", {
    threadId: threadId ?? this.threadId,
    startFrame: 0,
    levels: 50,
  })

  const body = response.body ?? {}
  const frames = (body.stackFrames ?? []) as any[]
  this.frameIds = frames.map((f: any) => f.id as number)

  return frames.map((f: any) => ({
    id: f.id,
    name: f.name,
    source: f.source ? { path: f.source.path, name: f.source.name } : undefined,
    line: f.line,
    column: f.column,
  }))
}

async getVariables(
  frameId?: number,
  scope?: string,
  _maxDepth?: number,
): Promise<Variable[]> {
  if (!this.client) throw new Error("Not connected")

  const targetFrameId = frameId ?? this.frameIds[0]
  if (targetFrameId === undefined) return []

  const scopesResponse = await this.client.sendRequest("scopes", {
    frameId: targetFrameId,
  })
  const scopes = ((scopesResponse.body ?? {}).scopes ?? []) as any[]

  const targetScopes = scope
    ? scopes.filter((s: any) => s.name.toLowerCase() === scope.toLowerCase())
    : scopes.filter(
        (s: any) =>
          s.name === "Locals" ||
          s.name === "Local" ||
          s.name.toLowerCase().includes("local"),
      )

  const variables: Variable[] = []
  for (const s of targetScopes.length > 0 ? targetScopes : scopes.slice(0, 1)) {
    const varsResponse = await this.client.sendRequest("variables", {
      variablesReference: s.variablesReference,
    })
    const vars = ((varsResponse.body ?? {}).variables ?? []) as any[]
    variables.push(
      ...vars.map((v: any) => ({
        name: v.name,
        value: v.value,
        type: v.type,
        variablesReference: v.variablesReference ?? 0,
      })),
    )
  }

  return variables
}

async evaluate(expression: string, frameId?: number): Promise<EvalResult> {
  if (!this.client) throw new Error("Not connected")

  const targetFrameId = frameId ?? this.frameIds[0]
  const response = await this.client.sendRequest("evaluate", {
    expression,
    frameId: targetFrameId,
    context: "repl",
  })

  const body = response.body ?? {}
  return {
    result: (body.result as string) ?? "",
    type: body.type as string | undefined,
    variablesReference: body.variablesReference as number | undefined,
  }
}

async disconnect(): Promise<void> {
  if (this.client) {
    try {
      await this.client.sendRequest("disconnect", { terminateDebuggee: true })
    } catch {
      // Ignore errors during disconnect
    }
    await this.client.disconnect()
    this.client = null
  }
  if (this.process) {
    this.process.kill()
    this.process = null
  }
}
```

- [ ] **Step 2: Verify typecheck and tests still pass**

Run: `cd packages/debugger && bun run typecheck && bun test`
Expected: typecheck clean; 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/debugger/src/adapter/go.ts
git commit -m "feat(debugger): wire GoAdapter DAP pass-through methods"
```

---

## Task 7: Replace `waitForStop` stub with real implementation

**Files:**
- Modify: `packages/debugger/src/adapter/go.ts`

- [ ] **Step 1: Replace the placeholder `waitForStop`**

In `packages/debugger/src/adapter/go.ts`, replace the placeholder:

```ts
private waitForStop(): Promise<StopResult> {
  return Promise.resolve({ reason: "entry" })
}
```

with the real implementation (mirrors `PythonAdapter.waitForStop` exactly so reasoning matches the proven version):

```ts
private waitForStop(): Promise<StopResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error("Timed out waiting for debugger to stop"))
    }, WAIT_TIMEOUT)

    const cleanup = () => {
      clearTimeout(timer)
      const idx = this.stoppedCallbacks.indexOf(handler)
      if (idx >= 0) this.stoppedCallbacks.splice(idx, 1)
      this.client?.off("terminated", terminatedHandler)
      this.process?.removeListener("exit", exitHandler)
    }

    const handler = async (info: StoppedInfo) => {
      cleanup()
      try {
        const frames = await this.getCallStack(info.threadId)
        const topFrame = frames[0]
        resolve({
          reason: info.reason,
          threadId: info.threadId,
          location: topFrame
            ? {
                file: topFrame.source?.path,
                line: topFrame.line,
                column: topFrame.column,
                name: topFrame.name,
              }
            : undefined,
        })
      } catch {
        resolve({ reason: info.reason, threadId: info.threadId })
      }
    }

    const terminatedHandler = () => {
      cleanup()
      resolve({ reason: "terminated", terminated: true })
    }

    const exitHandler = () => {
      cleanup()
      resolve({ reason: "terminated", terminated: true })
    }

    this.stoppedCallbacks.push(handler)
    this.client?.on("terminated", terminatedHandler)
    this.process?.once("exit", exitHandler)
  })
}
```

- [ ] **Step 2: Verify typecheck and tests still pass**

Run: `cd packages/debugger && bun run typecheck && bun test`
Expected: typecheck clean; 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/debugger/src/adapter/go.ts
git commit -m "feat(debugger): wire GoAdapter waitForStop with terminated/exit handlers"
```

---

## Task 8: Register `GoAdapter` in the registry

**Files:**
- Modify: `packages/debugger/src/adapter/registry.ts`

- [ ] **Step 1: Add the import and factory registration**

In `packages/debugger/src/adapter/registry.ts`, add to the imports (after the `PythonAdapter` import on line 3):

```ts
import { GoAdapter } from "./go"
```

Then update the `factories` Map (lines 7-10) to add the Go entry:

```ts
const factories = new Map<string, AdapterFactory>([
  ["node", () => new NodeAdapter()],
  ["python", () => new PythonAdapter()],
  ["go", () => new GoAdapter()],
])
```

- [ ] **Step 2: Add `.go` detection and update the error message**

In the same file, update `detectType` (lines 25-40) to:

```ts
export function detectType(program: string): string {
  if (program.endsWith(".py")) return "python"
  if (program.endsWith(".go")) return "go"
  if (
    program.endsWith(".js") ||
    program.endsWith(".ts") ||
    program.endsWith(".mjs") ||
    program.endsWith(".cjs") ||
    program.endsWith(".tsx") ||
    program.endsWith(".jsx")
  ) {
    return "node"
  }
  throw new Error(
    `Cannot auto-detect debug type for "${program}". Specify type explicitly ("node", "python", or "go").`,
  )
}
```

- [ ] **Step 3: Verify typecheck and tests still pass**

Run: `cd packages/debugger && bun run typecheck && bun test`
Expected: typecheck clean; 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/debugger/src/adapter/registry.ts
git commit -m "feat(debugger): register GoAdapter and auto-detect .go files"
```

---

## Task 9: Create Go fixture program and tests

**Files:**
- Create: `packages/debugger/test/fixtures/go/go.mod`
- Create: `packages/debugger/test/fixtures/go/main.go`
- Create: `packages/debugger/test/fixtures/go/main_test.go`

- [ ] **Step 1: Create the Go module file**

Create `packages/debugger/test/fixtures/go/go.mod` with:

```
module debuggerfixture

go 1.21
```

- [ ] **Step 2: Create the main program**

Create `packages/debugger/test/fixtures/go/main.go` with:

```go
package main

import "fmt"

func add(a, b int) int {
	sum := a + b
	return sum
}

func main() {
	x := 2
	y := 3
	result := add(x, y)
	fmt.Println("result:", result)
}
```

- [ ] **Step 3: Create the test file**

Create `packages/debugger/test/fixtures/go/main_test.go` with:

```go
package main

import "testing"

func TestAddPasses(t *testing.T) {
	if add(2, 3) != 5 {
		t.Fatalf("expected 5")
	}
}

func TestAddFails(t *testing.T) {
	if add(2, 3) != 6 {
		t.Fatalf("expected 6, got %d", add(2, 3))
	}
}
```

- [ ] **Step 4: Verify the fixture builds and tests run (sanity check, not under Delve)**

Run: `cd packages/debugger/test/fixtures/go && go build ./... && go test ./...`
Expected: build succeeds; one test passes (`TestAddPasses`), one fails (`TestAddFails`). Failing test is intentional — used in the smoke harness.

- [ ] **Step 5: Commit**

```bash
git add packages/debugger/test/fixtures/go
git commit -m "test(debugger): add Go fixture module with main and test files"
```

---

## Task 10: Write the manual smoke harness

**Files:**
- Create: `packages/debugger/test/manual/go-smoke.ts`

- [ ] **Step 1: Create the smoke script**

Create `packages/debugger/test/manual/go-smoke.ts` with:

```ts
/**
 * Manual smoke test for GoAdapter. Requires `dlv` and `go` on PATH.
 *
 * Usage:
 *   cd packages/debugger
 *   bun run test/manual/go-smoke.ts
 *
 * Exits 0 on success, 1 on failure.
 */
import { GoAdapter } from "../../src/adapter/go"
import * as path from "path"

const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/go")

async function expect(label: string, cond: boolean, detail?: string) {
  if (!cond) {
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ""}`)
    process.exit(1)
  }
  console.log(`PASS: ${label}`)
}

async function runDebugMode() {
  console.log("\n=== Scenario 1: dlv debug on main.go ===")
  const adapter = new GoAdapter()
  await adapter.start({
    type: "go",
    program: path.join(FIXTURE_DIR, "main.go"),
    cwd: FIXTURE_DIR,
  })
  const initial = await adapter.waitForInitialPause()
  await expect("initial pause reached", initial.reason !== "terminated")

  const bps = await adapter.setBreakpoints(path.join(FIXTURE_DIR, "main.go"), [
    { line: 6 }, // `sum := a + b` inside add()
  ])
  await expect("breakpoint verified", bps[0]?.verified === true)

  const stop = await adapter.continue()
  await expect(
    "stopped at breakpoint",
    stop.reason === "breakpoint" && stop.location?.line === 6,
    `got reason=${stop.reason}, line=${stop.location?.line}`,
  )

  const frames = await adapter.getCallStack()
  await expect("call stack has at least one frame", frames.length > 0)

  const vars = await adapter.getVariables()
  const a = vars.find((v) => v.name === "a")
  const b = vars.find((v) => v.name === "b")
  await expect(
    "locals a and b present",
    a?.value === "2" && b?.value === "3",
    `a=${a?.value} b=${b?.value}`,
  )

  const evalResult = await adapter.evaluate("a + b + 1")
  await expect(
    "evaluate(a + b + 1) returns 6",
    evalResult.result === "6",
    `got ${evalResult.result}`,
  )

  await adapter.continue()
  await adapter.disconnect()
  console.log("Scenario 1 OK")
}

async function runTestMode() {
  console.log("\n=== Scenario 2: dlv test auto-detected from _test.go ===")
  const adapter = new GoAdapter()
  await adapter.start({
    type: "go",
    program: path.join(FIXTURE_DIR, "main_test.go"),
    cwd: FIXTURE_DIR,
    testFilter: "-test.run=TestAddPasses",
  })
  const initial = await adapter.waitForInitialPause()
  await expect("test mode reached entry", initial.reason !== "terminated")

  const stop = await adapter.continue()
  await expect(
    "test ran to completion (terminated)",
    stop.terminated === true,
    `got reason=${stop.reason}`,
  )

  await adapter.disconnect()
  console.log("Scenario 2 OK")
}

async function main() {
  await runDebugMode()
  await runTestMode()
  console.log("\nAll smoke scenarios passed.")
}

main().catch((err) => {
  console.error("Smoke harness threw:", err)
  process.exit(1)
})
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd packages/debugger && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/debugger/test/manual/go-smoke.ts
git commit -m "test(debugger): add manual end-to-end smoke harness for GoAdapter"
```

---

## Task 11: Run the smoke harness end-to-end

**Files:** none modified — this task verifies the implementation works against real Delve.

- [ ] **Step 1: Confirm `dlv` and `go` are installed**

Run: `dlv version && go version`
Expected: both commands print version info. If `dlv` is missing, install via `go install github.com/go-delve/delve/cmd/dlv@latest` and ensure `$GOPATH/bin` is on `PATH`.

- [ ] **Step 2: Run the smoke harness**

Run: `cd packages/debugger && bun run test/manual/go-smoke.ts`
Expected: output ends with `All smoke scenarios passed.` and exit code 0.

If a scenario fails, investigate the captured output. Common issues:
- `dlv dap failed to start` — check `dlv version` is recent (>=1.20).
- Breakpoint not verified — line numbers in `main.go` may have shifted; re-check `bps[0].verified` and the breakpoint line.
- `stop.reason !== "breakpoint"` — may indicate the program ran past the breakpoint (e.g., wrong file path); confirm the path matches what dlv compiled.

- [ ] **Step 3: Run unit tests one more time**

Run: `cd packages/debugger && bun test`
Expected: 7 tests pass.

- [ ] **Step 4: Run typecheck across the whole package**

Run: `cd packages/debugger && bun run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit a final note (only if anything was tweaked during smoke testing)**

If any source file changed during smoke testing:

```bash
git add -u
git commit -m "fix(debugger): adjust GoAdapter based on smoke-test feedback"
```

If no changes were needed, skip this step.

---

## Self-Review

**Spec coverage check:**

- ✅ File layout (spec §"File Layout") → Tasks 5, 8
- ✅ LaunchConfig fields (spec §"LaunchConfig Changes") → Task 1
- ✅ Mode auto-detection (spec §"Mode Auto-detection") → Task 3
- ✅ Registry wiring + `.go` extension (spec §"Registry Wiring") → Task 8
- ✅ `dlv` resolution + install error (spec §"GoAdapter.start Flow" step 1) → Task 4
- ✅ Free port + waitForPort (spec §"GoAdapter.start Flow" steps 2-4) → Task 5
- ✅ DAP initialize + launch with mode/program/args/cwd/env/buildFlags/stopOnEntry (spec §"GoAdapter.start Flow" steps 5-8) → Task 5
- ✅ DAP pass-through methods (spec §"Other Interface Methods") → Task 6
- ✅ Disconnect with terminateDebuggee (spec §"Disconnect") → Task 6
- ✅ Stderr buffering for diagnostics (spec §"Error Surfacing") → Task 5 (port-wait error includes stderr tail)
- ✅ Manual smoke fixture + script (spec §"Manual Smoke Test") → Tasks 9, 10, 11
- ✅ Unit tests for the three required cases (spec §"Unit Tests") → Tasks 3, 4

**Placeholder scan:** No "TBD"/"TODO"/"implement later" left in plan body. The Task 5 stub block is explicitly replaced in Tasks 6 and 7 (this is staged decomposition, not a placeholder).

**Type/method consistency:** `resolveGoMode`, `resolveDlvBinary`, and all `DebugAdapter` interface methods use consistent names matching `base.ts` and `python.ts`. `GoAdapter.id === "go"` matches the registry key.
