import { spawn, type ChildProcess } from "child_process"
import * as path from "path"
import type { SourceBreakpoint, StackFrame, Variable } from "../dap/types"
import type {
  BreakpointResult,
  DebugAdapter,
  EvalResult,
  LaunchConfig,
  StopResult,
  StoppedInfo,
} from "./base"
import { DapClient } from "../dap/client"
import { findFreePort } from "../util/port"

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
      ["dap", "--listen", `127.0.0.1:${port}`, "--check-go-version=false"],
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

    let stdoutBuffer = ""
    const ready = new Promise<void>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        stdoutBuffer += chunk.toString()
        if (stdoutBuffer.includes("DAP server listening at:")) {
          this.process?.stdout?.off("data", onData)
          resolve()
        }
      }
      this.process?.stdout?.on("data", onData)
      const exitHandler = () => {
        this.process?.stdout?.off("data", onData)
        reject(new Error("dlv exited before listener was ready"))
      }
      this.process?.once("exit", exitHandler)
      setTimeout(() => {
        this.process?.stdout?.off("data", onData)
        reject(new Error("Timed out waiting for dlv listener"))
      }, 10_000)
    })

    try {
      await ready
    } catch (err) {
      const stderrTail = this.stderrBuffer.trim().split("\n").slice(-5).join("\n")
      const stdoutTail = stdoutBuffer.trim().split("\n").slice(-5).join("\n")
      const detail = [
        err instanceof Error ? err.message : String(err),
        stdoutTail ? `stdout:\n${stdoutTail}` : "",
        stderrTail ? `stderr:\n${stderrTail}` : "",
      ]
        .filter(Boolean)
        .join("\n")
      throw new Error(`dlv dap failed to start on port ${port}.\n${detail}`)
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

    // dlv test mode requires a package directory, not a .go file.
    const launchProgram =
      mode === "test" && config.program.endsWith(".go")
        ? path.dirname(config.program)
        : config.program

    await this.client.sendRequest("launch", {
      type: "go",
      request: "launch",
      mode,
      program: launchProgram,
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

  onStopped(cb: (event: StoppedInfo) => void): void {
    this.stoppedCallbacks.push(cb)
  }

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
}
