import { spawn, type ChildProcess, execSync } from "child_process"
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

const WAIT_TIMEOUT = 30_000

/**
 * Python debug adapter using debugpy's native DAP support over TCP.
 */
export class PythonAdapter implements DebugAdapter {
  readonly id = "python"
  private process: ChildProcess | null = null
  private client: DapClient | null = null
  private stoppedCallbacks: ((event: StoppedInfo) => void)[] = []
  private threadId = 1
  private frameIds: number[] = []
  private initialPausePromise: Promise<StopResult> | null = null

  async start(config: LaunchConfig): Promise<void> {
    const pythonPath = config.pythonPath ?? "python3"
    try {
      execSync(`${pythonPath} -c "import debugpy"`, {
        stdio: "pipe",
        timeout: 5000,
      })
    } catch {
      throw new Error(
        `debugpy is not installed. Install it with: ${pythonPath} -m pip install debugpy`,
      )
    }

    const port = await findFreePort()
    const program = config.module ? ["-m", config.module] : [config.program]
    const args = [
      "-m",
      "debugpy",
      "--listen",
      `127.0.0.1:${port}`,
      "--wait-for-client",
      "--",
      ...program,
      ...(config.args ?? []),
    ]

    this.process = spawn(pythonPath, args, {
      cwd: config.cwd,
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    })

    this.process.on("error", (err) => {
      console.error(`[python-adapter] Process error: ${err.message}`)
    })

    await waitForPort(port)

    this.client = new DapClient("127.0.0.1", port)
    await this.client.connect()

    // Listen for stopped events
    this.client.on("stopped", (body) => {
      this.threadId = (body.threadId as number) ?? 1
      const info: StoppedInfo = {
        reason: (body.reason as string) ?? "breakpoint",
        threadId: this.threadId,
        description: body.description as string | undefined,
      }
      for (const cb of this.stoppedCallbacks) {
        cb(info)
      }
    })

    // Set up initial pause promise BEFORE sending configurationDone
    // so we capture the stopOnEntry pause
    this.initialPausePromise = this.waitForStop()

    // DAP initialization sequence
    await this.client.sendRequest("initialize", {
      clientID: "opencode-debugger",
      clientName: "OpenCode Debugger",
      adapterID: "python",
      pathFormat: "path",
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsRunInTerminalRequest: false,
    })

    await this.client.sendRequest("launch", {
      type: "python",
      request: "launch",
      program: config.module ? undefined : config.program,
      module: config.module,
      args: config.args ?? [],
      cwd: config.cwd ?? process.cwd(),
      stopOnEntry: true,
      justMyCode: true,
    })

    await this.client.sendRequest("configurationDone", {})
  }

  /**
   * Wait for the initial stopOnEntry pause. Call after start().
   */
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
    // Register handler BEFORE sending continue to avoid race
    const stopPromise = this.waitForStop()
    await this.client.sendRequest("continue", {
      threadId: threadId ?? this.threadId,
    })
    return stopPromise
  }

  async stepOver(threadId?: number): Promise<StopResult> {
    if (!this.client) throw new Error("Not connected")
    const stopPromise = this.waitForStop()
    await this.client.sendRequest("next", {
      threadId: threadId ?? this.threadId,
    })
    return stopPromise
  }

  async stepIn(threadId?: number): Promise<StopResult> {
    if (!this.client) throw new Error("Not connected")
    const stopPromise = this.waitForStop()
    await this.client.sendRequest("stepIn", {
      threadId: threadId ?? this.threadId,
    })
    return stopPromise
  }

  async stepOut(threadId?: number): Promise<StopResult> {
    if (!this.client) throw new Error("Not connected")
    const stopPromise = this.waitForStop()
    await this.client.sendRequest("stepOut", {
      threadId: threadId ?? this.threadId,
    })
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
      source: f.source
        ? { path: f.source.path, name: f.source.name }
        : undefined,
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
      ? scopes.filter(
          (s: any) => s.name.toLowerCase() === scope.toLowerCase(),
        )
      : scopes.filter(
          (s: any) =>
            s.name === "Locals" ||
            s.name === "Local" ||
            s.name.toLowerCase().includes("local"),
        )

    const variables: Variable[] = []
    for (const s of targetScopes.length > 0
      ? targetScopes
      : scopes.slice(0, 1)) {
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
        await this.client.sendRequest("disconnect", {
          terminateDebuggee: true,
        })
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
