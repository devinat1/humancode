# Go Debugger Adapter

## Problem

The debugger MCP server in `packages/debugger` supports Node and Python via per-language adapters in `src/adapter/`. Agent debug mode can drive those adapters through the MCP `debugger_*` tools, but Go programs and Go tests cannot be debugged because no Go adapter exists.

## Solution

Add a `GoAdapter` that drives Delve (`dlv`) over the Debug Adapter Protocol, reusing the existing `DapClient`. Wire it into the adapter registry alongside Node and Python. Auto-detect Go targets by `.go` file extension, and auto-detect test mode from the `_test.go` filename convention with an explicit `goMode` override for edge cases.

## Design

### File Layout

```
packages/debugger/src/
├── adapter/
│   ├── base.ts            (extend LaunchConfig with Go fields)
│   ├── registry.ts        (register "go" + add .go detection)
│   ├── go.ts              (NEW — GoAdapter)
│   ├── node.ts            (unchanged)
│   └── python.ts          (unchanged, reference pattern)
└── dap/
    └── client.ts          (reused as-is)
```

No changes to `session/manager.ts`, the MCP tool layer, or the in-process server wiring in `packages/opencode/src/mcp/index.ts`. The registry is the only seam.

### LaunchConfig Changes

Extend `LaunchConfig` in `packages/debugger/src/adapter/base.ts`:

```ts
export interface LaunchConfig {
  type: string                       // "node" | "python" | "go"
  program: string                    // file path OR Go package path (e.g., "./cmd/server")
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  runtimeExecutable?: string
  runtimeArgs?: string[]
  pythonPath?: string
  module?: string

  // NEW — Go-specific
  dlvPath?: string                   // override path to `dlv` (defaults to PATH lookup)
  goMode?: "debug" | "test"          // override auto-detection (_test.go → "test")
  buildFlags?: string                // passed to dlv `--build-flags`, e.g. "-tags=integration"
  testFilter?: string                // passed as dlv args after `--`, e.g. "-test.run=TestFoo"
}
```

### Mode Auto-detection

In `GoAdapter.start`:

1. If `config.goMode` is set, use it.
2. Else if `config.program` ends in `_test.go`, mode = `"test"`.
3. Else mode = `"debug"`.

A Go *package path* like `./cmd/server` (no `.go` suffix) cannot be inferred at the registry level — the caller must pass `type: "go"` explicitly. Documented in the adapter's JSDoc; no probing heuristic in v1.

### Registry Wiring

Two-line change to `packages/debugger/src/adapter/registry.ts`:

```ts
factories.set("go", () => new GoAdapter())
```

```ts
if (program.endsWith(".go")) return "go"
```

### GoAdapter.start Flow

1. **Resolve `dlv` binary.** Use `config.dlvPath` if provided; otherwise check `$PATH` (`Bun.which` or equivalent). If absent, throw:
   ```
   Delve (dlv) not found. Install with:
     go install github.com/go-delve/delve/cmd/dlv@latest
   Or pass dlvPath in the launch config.
   ```

2. **Pick free TCP port.** Reuse the codebase helper Python uses; if none exists, bind `:0` and read back the assigned port.

3. **Spawn `dlv dap --listen=127.0.0.1:<port>`** with `cwd` from config and merged env. Pipe stderr to a buffer for diagnostic surfacing.

4. **Wait for the port to accept TCP connections** (poll with short backoff, ~5s timeout). If the dlv process exits before accepting, surface the captured stderr in the thrown error.

5. **Open `DapClient` over TCP**, attach event handlers — in particular, fan `stopped` events out via `onStopped`.

6. **Send DAP `initialize`** with the same capabilities request the Python adapter uses.

7. **Send DAP `launch`** with body:
   ```ts
   {
     request: "launch",
     mode: goMode,                         // "debug" | "test"
     program: config.program,
     args: [...args, ...(testFilter ? ["--", testFilter] : [])],
     cwd: config.cwd,
     env: config.env,
     buildFlags: config.buildFlags,
     stopOnEntry: true,                    // matches waitForInitialPause contract
   }
   ```

8. **Send `configurationDone`** to release startup.

### Other Interface Methods

`setBreakpoints`, `continue`, `stepOver`, `stepIn`, `stepOut`, `getCallStack`, `getVariables`, `evaluate` are thin pass-throughs to `DapClient` — same shape as `PythonAdapter`. The DAP protocol does the heavy lifting.

### Disconnect

Call DAP `disconnect` with `terminateDebuggee: true`, close the socket, kill the `dlv` process if still alive, drain the stderr buffer.

### Error Surfacing

DAP error responses and stderr lines containing `Error:` are wrapped into a thrown `Error` with the dlv stderr tail attached. This ensures the agent sees real diagnostics like "build failed: undefined: foo" rather than opaque protocol errors.

## Testing

### Manual Smoke Test (Primary Verification)

Fixture in `packages/debugger/test/fixtures/go/`:

- `main.go` — 10-line program with a deliberate bug and one obvious breakpoint location.
- `main_test.go` — one passing test, one failing test.
- `go.mod` — minimal module file.

Manual run script `packages/debugger/test/manual/go-smoke.ts` that:

1. Calls `createAdapter("go")` and `start({ program: "main.go", ... })`.
2. Sets a breakpoint, continues, verifies it hits.
3. Calls `getCallStack`, `getVariables`, `evaluate("x + 1")`.
4. Repeats with `program: "main_test.go"` to confirm `_test.go` auto-detection fires `dlv test` mode.
5. Disconnects cleanly.

End-to-end confidence with real Delve is the value; a mocked `DapClient` would not catch DAP-flow regressions.

### Unit Tests

`packages/debugger/test/adapter/go.test.ts` covering pure logic that does not need a live `dlv`:

- `_test.go` filename → `goMode === "test"` auto-detection.
- Explicit `goMode` overrides the heuristic.
- Missing `dlv` binary throws an error containing the install command.

### Out of Scope (YAGNI for v1)

- Mocking the full DAP protocol.
- CI integration that installs Delve.
- `dlv exec` and `dlv attach` modes.
- Auto-install of Delve when missing.
- Detecting "this directory is a Go package" via filesystem probing.
