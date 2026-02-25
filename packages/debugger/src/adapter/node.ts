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
import { findFreePort } from "../util/port"

interface CdpResponse {
  id: number
  result?: Record<string, any>
  error?: { message: string }
}

interface CdpEvent {
  method: string
  params?: Record<string, any>
}

type CdpMessage = CdpResponse | CdpEvent

const WAIT_TIMEOUT = 30_000

/**
 * Node.js debug adapter using Chrome DevTools Protocol (CDP) over WebSocket.
 */
export class NodeAdapter implements DebugAdapter {
  readonly id = "node"
  private process: ChildProcess | null = null
  private ws: WebSocket | null = null
  private seq = 1
  private pending = new Map<
    number,
    { resolve: (r: any) => void; reject: (e: Error) => void }
  >()
  private stoppedCallbacks: ((event: StoppedInfo) => void)[] = []
  private scripts = new Map<string, string>() // scriptId -> file path
  private fileToScript = new Map<string, string>() // file path -> scriptId
  private pausedFrames: any[] = []
  private pausedReason = ""
  private pausedThreadId = 1
  private breakpointIds = new Map<string, string[]>() // file -> breakpointIds
  private initialPausePromise: Promise<StopResult> | null = null

  async start(config: LaunchConfig): Promise<void> {
    const port = await findFreePort()
    const runtime = config.runtimeExecutable ?? "node"
    const runtimeArgs = config.runtimeArgs ?? []
    const args = [
      ...runtimeArgs,
      `--inspect-brk=127.0.0.1:${port}`,
      config.program,
      ...(config.args ?? []),
    ]

    // Set up the initial pause promise BEFORE spawning so we don't miss the event
    this.initialPausePromise = this.waitForPause()

    this.process = spawn(runtime, args, {
      cwd: config.cwd,
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    })

    this.process.on("error", (err) => {
      console.error(`[node-adapter] Process error: ${err.message}`)
    })

    // Wait for the inspector to be ready by polling the /json endpoint
    const wsUrl = await this.waitForDebugger(port)
    await this.connectWebSocket(wsUrl)

    // Enable debugger and runtime domains — this triggers the initial paused event
    await this.cdpSend("Debugger.enable", {})
    await this.cdpSend("Runtime.enable", {})
  }

  /**
   * Wait for the initial --inspect-brk pause. Call after start() to get
   * the entry-point location.
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
    // Remove existing breakpoints for this file
    const existingIds = this.breakpointIds.get(file) ?? []
    for (const bpId of existingIds) {
      await this.cdpSend("Debugger.removeBreakpoint", {
        breakpointId: bpId,
      })
    }

    const results: BreakpointResult[] = []
    const newIds: string[] = []

    for (const bp of breakpoints) {
      try {
        const response = await this.cdpSend("Debugger.setBreakpointByUrl", {
          lineNumber: bp.line - 1, // CDP uses 0-based lines
          url: this.pathToFileUrl(file),
          columnNumber: bp.column ? bp.column - 1 : undefined,
          condition: bp.condition,
        })
        const breakpointId = response.breakpointId as string
        const locations = response.locations as any[]
        newIds.push(breakpointId)
        results.push({
          id: results.length,
          verified: locations.length > 0,
          line:
            locations.length > 0
              ? (locations[0].lineNumber as number) + 1
              : bp.line,
        })
      } catch (err: any) {
        results.push({
          verified: false,
          line: bp.line,
          message: err.message,
        })
      }
    }

    this.breakpointIds.set(file, newIds)
    return results
  }

  async continue(_threadId?: number): Promise<StopResult> {
    // Register handler BEFORE sending resume to avoid race
    const pausePromise = this.waitForPause()
    await this.cdpSend("Debugger.resume", {})
    return pausePromise
  }

  async stepOver(_threadId?: number): Promise<StopResult> {
    const pausePromise = this.waitForPause()
    await this.cdpSend("Debugger.stepOver", {})
    return pausePromise
  }

  async stepIn(_threadId?: number): Promise<StopResult> {
    const pausePromise = this.waitForPause()
    await this.cdpSend("Debugger.stepInto", {})
    return pausePromise
  }

  async stepOut(_threadId?: number): Promise<StopResult> {
    const pausePromise = this.waitForPause()
    await this.cdpSend("Debugger.stepOut", {})
    return pausePromise
  }

  async getCallStack(_threadId?: number): Promise<StackFrame[]> {
    return this.pausedFrames.map((frame: any, i: number) => {
      const filePath = this.scriptIdToPath(frame.location?.scriptId)
      return {
        id: i,
        name: frame.functionName || "(anonymous)",
        source: filePath
          ? { path: filePath, name: filePath.split("/").pop() }
          : undefined,
        line: (frame.location?.lineNumber ?? 0) + 1,
        column: (frame.location?.columnNumber ?? 0) + 1,
      }
    })
  }

  async getVariables(
    frameId?: number,
    scope?: string,
    maxDepth?: number,
  ): Promise<Variable[]> {
    const frame = this.pausedFrames[frameId ?? 0]
    if (!frame) return []

    const scopeChain: any[] = frame.scopeChain ?? []
    const targetScopes = scope
      ? scopeChain.filter((s: any) => s.type === scope)
      : scopeChain.filter(
          (s: any) => s.type === "local" || s.type === "closure",
        )

    const variables: Variable[] = []
    for (const s of targetScopes) {
      const objectId = s.object?.objectId
      if (!objectId) continue
      const props = await this.getProperties(objectId, maxDepth ?? 1, 0)
      variables.push(...props)
    }
    return variables
  }

  async evaluate(expression: string, frameId?: number): Promise<EvalResult> {
    const frame = this.pausedFrames[frameId ?? 0]
    if (!frame) {
      const response = await this.cdpSend("Runtime.evaluate", {
        expression,
        generatePreview: true,
      })
      return this.formatEvalResult(response.result)
    }

    const response = await this.cdpSend("Debugger.evaluateOnCallFrame", {
      callFrameId: frame.callFrameId,
      expression,
      generatePreview: true,
    })
    return this.formatEvalResult(response.result)
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }

  onStopped(cb: (event: StoppedInfo) => void): void {
    this.stoppedCallbacks.push(cb)
  }

  // --- Private helpers ---

  private async waitForDebugger(
    port: number,
    timeout = 10000,
  ): Promise<string> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json`)
        const targets = (await response.json()) as any[]
        const target = targets.find((t: any) => t.webSocketDebuggerUrl)
        if (target) return target.webSocketDebuggerUrl as string
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`Timed out waiting for Node.js inspector on port ${port}`)
  }

  private async connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.onopen = () => {
        this.ws = ws
        resolve()
      }
      ws.onerror = (err) => {
        reject(new Error(`WebSocket connection failed: ${err}`))
      }
      ws.onmessage = (event) => {
        try {
          const data =
            typeof event.data === "string"
              ? event.data
              : event.data.toString()
          const message = JSON.parse(data) as CdpMessage
          this.handleCdpMessage(message)
        } catch {
          // Skip malformed messages
        }
      }
      ws.onclose = () => {
        this.ws = null
      }
    })
  }

  private cdpSend(method: string, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error("Not connected"))
        return
      }
      const id = this.seq++
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  private handleCdpMessage(message: CdpMessage): void {
    if ("id" in message) {
      const response = message as CdpResponse
      const pending = this.pending.get(response.id)
      if (pending) {
        this.pending.delete(response.id)
        if (response.error) {
          pending.reject(new Error(response.error.message))
        } else {
          pending.resolve(response.result ?? {})
        }
      }
    } else if ("method" in message) {
      const event = message as CdpEvent
      if (event.method === "Debugger.scriptParsed") {
        this.onScriptParsed(event.params ?? {})
      } else if (event.method === "Debugger.paused") {
        this.onPaused(event.params ?? {})
      } else if (event.method === "Debugger.resumed") {
        this.pausedFrames = []
      }
    }
  }

  private onScriptParsed(params: Record<string, any>): void {
    const scriptId = params.scriptId as string
    const url = params.url as string
    if (url && url.startsWith("file://")) {
      const filePath = this.fileUrlToPath(url)
      this.scripts.set(scriptId, filePath)
      this.fileToScript.set(filePath, scriptId)
    }
  }

  private onPaused(params: Record<string, any>): void {
    this.pausedFrames = params.callFrames ?? []
    this.pausedReason = (params.reason as string) ?? "breakpoint"
    const info: StoppedInfo = {
      reason: this.pausedReason,
      threadId: this.pausedThreadId,
    }
    for (const cb of this.stoppedCallbacks) {
      cb(info)
    }
  }

  private waitForPause(): Promise<StopResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error("Timed out waiting for debugger to pause"))
      }, WAIT_TIMEOUT)

      const cleanup = () => {
        clearTimeout(timer)
        const idx = this.stoppedCallbacks.indexOf(onStopped)
        if (idx >= 0) this.stoppedCallbacks.splice(idx, 1)
        this.process?.removeListener("exit", exitHandler)
      }

      const onStopped = (info: StoppedInfo) => {
        cleanup()
        const frame = this.pausedFrames[0]
        const filePath = frame
          ? this.scriptIdToPath(frame.location?.scriptId)
          : undefined
        resolve({
          reason: info.reason,
          threadId: info.threadId,
          location: frame
            ? {
                file: filePath,
                line: (frame.location?.lineNumber ?? 0) + 1,
                column: (frame.location?.columnNumber ?? 0) + 1,
                name: frame.functionName || "(anonymous)",
              }
            : undefined,
        })
      }

      const exitHandler = () => {
        cleanup()
        resolve({ reason: "terminated", terminated: true })
      }

      this.stoppedCallbacks.push(onStopped)
      this.process?.once("exit", exitHandler)
    })
  }

  private async getProperties(
    objectId: string,
    maxDepth: number,
    currentDepth: number,
  ): Promise<Variable[]> {
    const response = await this.cdpSend("Runtime.getProperties", {
      objectId,
      ownProperties: true,
      generatePreview: true,
    })

    const properties = (response.result ?? []) as any[]
    const variables: Variable[] = []

    for (const prop of properties) {
      if (prop.name === "__proto__") continue
      const value = prop.value
      if (!value) continue

      const variable: Variable = {
        name: prop.name,
        value: this.formatValue(value),
        type: value.type,
        variablesReference: 0,
      }

      if (
        value.objectId &&
        (value.type === "object" || value.subtype === "array") &&
        currentDepth < maxDepth
      ) {
        variable.variablesReference = 1
      }

      variables.push(variable)
    }

    return variables
  }

  private formatValue(value: any): string {
    if (value.type === "undefined") return "undefined"
    if (value.type === "string") return JSON.stringify(value.value)
    if (value.type === "number" || value.type === "boolean")
      return String(value.value)
    if (value.value === null) return "null"
    if (value.description) return value.description
    if (value.preview) return this.formatPreview(value.preview)
    return value.type
  }

  private formatPreview(preview: any): string {
    if (preview.type === "object") {
      const props = (preview.properties ?? [])
        .map((p: any) => `${p.name}: ${p.value}`)
        .join(", ")
      if (preview.subtype === "array") return `[${props}]`
      return `{${props}}`
    }
    return preview.description ?? preview.type
  }

  private formatEvalResult(result: any): EvalResult {
    return {
      result: this.formatValue(result),
      type: result.type,
      variablesReference: result.objectId ? 1 : 0,
    }
  }

  private scriptIdToPath(scriptId?: string): string | undefined {
    if (!scriptId) return undefined
    return this.scripts.get(scriptId)
  }

  private pathToFileUrl(filePath: string): string {
    if (filePath.startsWith("file://")) return filePath
    return `file://${filePath}`
  }

  private fileUrlToPath(url: string): string {
    return url.replace(/^file:\/\//, "")
  }
}
