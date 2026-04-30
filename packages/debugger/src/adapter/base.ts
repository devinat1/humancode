import type {
  Breakpoint,
  SourceBreakpoint,
  StackFrame,
  Variable,
} from "../dap/types"

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

export interface StopResult {
  reason: string
  description?: string
  threadId?: number
  location?: {
    file?: string
    line?: number
    column?: number
    name?: string
  }
  terminated?: boolean
}

export interface EvalResult {
  result: string
  type?: string
  variablesReference?: number
}

export interface StoppedInfo {
  reason: string
  threadId?: number
  description?: string
}

export interface BreakpointResult {
  id?: number
  verified: boolean
  line?: number
  message?: string
}

export interface DebugAdapter {
  readonly id: string
  start(config: LaunchConfig): Promise<void>
  waitForInitialPause(): Promise<StopResult>
  setBreakpoints(
    file: string,
    breakpoints: SourceBreakpoint[],
  ): Promise<BreakpointResult[]>
  continue(threadId?: number): Promise<StopResult>
  stepOver(threadId?: number): Promise<StopResult>
  stepIn(threadId?: number): Promise<StopResult>
  stepOut(threadId?: number): Promise<StopResult>
  getCallStack(threadId?: number): Promise<StackFrame[]>
  getVariables(
    frameId?: number,
    scope?: string,
    maxDepth?: number,
  ): Promise<Variable[]>
  evaluate(expression: string, frameId?: number): Promise<EvalResult>
  disconnect(): Promise<void>
  onStopped(cb: (event: StoppedInfo) => void): void
}
