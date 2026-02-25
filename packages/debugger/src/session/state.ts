import type { SourceBreakpoint } from "../dap/types"
import type { DebugAdapter } from "../adapter/base"

export interface BreakpointInfo {
  line: number
  column?: number
  condition?: string
  hitCondition?: string
  logMessage?: string
  verified: boolean
  id?: number
}

export interface SessionState {
  id: string
  adapter: DebugAdapter
  breakpoints: Map<string, BreakpointInfo[]>
  stoppedThreadId: number | null
  stoppedReason: string | null
}

export function createSessionState(
  id: string,
  adapter: DebugAdapter,
): SessionState {
  return {
    id,
    adapter,
    breakpoints: new Map(),
    stoppedThreadId: null,
    stoppedReason: null,
  }
}

export function getBreakpointsForFile(
  state: SessionState,
  file: string,
): BreakpointInfo[] {
  return state.breakpoints.get(file) ?? []
}

export function setBreakpointsForFile(
  state: SessionState,
  file: string,
  breakpoints: BreakpointInfo[],
): void {
  if (breakpoints.length === 0) {
    state.breakpoints.delete(file)
  } else {
    state.breakpoints.set(file, breakpoints)
  }
}

export function getAllBreakpoints(
  state: SessionState,
): Record<string, BreakpointInfo[]> {
  const result: Record<string, BreakpointInfo[]> = {}
  for (const [file, bps] of state.breakpoints) {
    result[file] = bps
  }
  return result
}

export function toSourceBreakpoints(
  infos: BreakpointInfo[],
): SourceBreakpoint[] {
  return infos.map((bp) => ({
    line: bp.line,
    column: bp.column,
    condition: bp.condition,
    hitCondition: bp.hitCondition,
    logMessage: bp.logMessage,
  }))
}
