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
