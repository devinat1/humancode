/**
 * Debug Adapter Protocol (DAP) message types.
 * Based on the DAP specification: https://microsoft.github.io/debug-adapter-protocol/
 */

export interface ProtocolMessage {
  seq: number
  type: "request" | "response" | "event"
}

export interface Request extends ProtocolMessage {
  type: "request"
  command: string
  arguments?: Record<string, unknown>
}

export interface Response extends ProtocolMessage {
  type: "response"
  request_seq: number
  success: boolean
  command: string
  message?: string
  body?: Record<string, unknown>
}

export interface Event extends ProtocolMessage {
  type: "event"
  event: string
  body?: Record<string, unknown>
}

export type DapMessage = Request | Response | Event

export interface Capabilities {
  supportsConfigurationDoneRequest?: boolean
  supportsFunctionBreakpoints?: boolean
  supportsConditionalBreakpoints?: boolean
  supportsHitConditionalBreakpoints?: boolean
  supportsEvaluateForHovers?: boolean
  supportsStepBack?: boolean
  supportsSetVariable?: boolean
  supportsRestartFrame?: boolean
  supportsGotoTargetsRequest?: boolean
  supportsStepInTargetsRequest?: boolean
  supportsCompletionsRequest?: boolean
  supportsModulesRequest?: boolean
  supportsExceptionOptions?: boolean
  supportsValueFormattingOptions?: boolean
  supportsExceptionInfoRequest?: boolean
  supportTerminateDebuggee?: boolean
  supportsDelayedStackTraceLoading?: boolean
  supportsLoadedSourcesRequest?: boolean
}

export interface Source {
  name?: string
  path?: string
  sourceReference?: number
}

export interface SourceBreakpoint {
  line: number
  column?: number
  condition?: string
  hitCondition?: string
  logMessage?: string
}

export interface Breakpoint {
  id?: number
  verified: boolean
  message?: string
  source?: Source
  line?: number
  column?: number
}

export interface StackFrame {
  id: number
  name: string
  source?: Source
  line: number
  column: number
  moduleId?: number | string
}

export interface Scope {
  name: string
  variablesReference: number
  expensive: boolean
  namedVariables?: number
  indexedVariables?: number
}

export interface Variable {
  name: string
  value: string
  type?: string
  variablesReference: number
  namedVariables?: number
  indexedVariables?: number
}

export interface Thread {
  id: number
  name: string
}

export interface StoppedEventBody {
  reason: string
  description?: string
  threadId?: number
  preserveFocusHint?: boolean
  text?: string
  allThreadsStopped?: boolean
}

export interface OutputEventBody {
  category?: "console" | "important" | "stdout" | "stderr" | "telemetry"
  output: string
  source?: Source
  line?: number
  column?: number
}

export interface TerminatedEventBody {
  restart?: boolean
}
