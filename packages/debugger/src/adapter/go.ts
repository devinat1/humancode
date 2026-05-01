import { spawn, type ChildProcess } from "child_process"
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
import { findFreePort, waitForPort } from "../util/port"

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
