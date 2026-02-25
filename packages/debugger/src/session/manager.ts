import type { LaunchConfig } from "../adapter/base"
import { createAdapter, detectType } from "../adapter/registry"
import { createSessionState, type SessionState } from "./state"

let activeSession: SessionState | null = null
let sessionCounter = 0

export function active(): SessionState | null {
  return activeSession
}

export function requireActive(): SessionState {
  if (!activeSession) {
    throw new Error("No active debug session. Use start_debug_session first.")
  }
  return activeSession
}

export async function create(config: LaunchConfig): Promise<SessionState> {
  // Stop any existing session
  if (activeSession) {
    await stop()
  }

  // Auto-detect type if not provided
  if (!config.type) {
    config.type = detectType(config.program)
  }

  const adapter = createAdapter(config.type)
  const id = `session-${++sessionCounter}`
  const state = createSessionState(id, adapter)

  // Track stopped events
  adapter.onStopped((event) => {
    state.stoppedThreadId = event.threadId ?? null
    state.stoppedReason = event.reason
  })

  await adapter.start(config)
  activeSession = state
  return state
}

export async function stop(): Promise<void> {
  if (!activeSession) return
  try {
    await activeSession.adapter.disconnect()
  } catch {
    // Ignore disconnect errors
  }
  activeSession = null
}

export async function stopAll(): Promise<void> {
  await stop()
}
