import { describe, expect, test } from "bun:test"
import { SocraticPhase } from "../../src/session/socratic-phase"

describe("SocraticPhase.create", () => {
  test("returns PLANNING phase, step 0, null totalSteps, false autoConfirm", () => {
    const state = SocraticPhase.create("test-session-1")
    expect(state.sessionID).toBe("test-session-1")
    expect(state.currentPhase).toBe("PLANNING")
    expect(state.currentStep).toBe(0)
    expect(state.totalSteps).toBeNull()
    expect(state.autoConfirm).toBe(false)
    expect(state.stepDescriptions).toEqual([])
  })
})

describe("SocraticPhase.transition", () => {
  test("valid path with HYPOTHESIS: PLANNING -> HYPOTHESIS -> SOCRATIC", () => {
    const state = SocraticPhase.create("test-hypo")
    const afterHypo = SocraticPhase.transition(state, "HYPOTHESIS")
    expect(afterHypo.currentPhase).toBe("HYPOTHESIS")
    const afterSoc = SocraticPhase.transition(afterHypo, "SOCRATIC")
    expect(afterSoc.currentPhase).toBe("SOCRATIC")
  })

  test("valid path skipping HYPOTHESIS: PLANNING -> SOCRATIC", () => {
    const state = SocraticPhase.create("test-skip-hypo")
    const afterSoc = SocraticPhase.transition(state, "SOCRATIC")
    expect(afterSoc.currentPhase).toBe("SOCRATIC")
  })

  test("full cycle back to PLANNING", () => {
    let state = SocraticPhase.create("test-cycle")
    state = SocraticPhase.transition(state, "HYPOTHESIS")
    state = SocraticPhase.transition(state, "SOCRATIC")
    state = SocraticPhase.transition(state, "SUMMARIZING")
    state = SocraticPhase.transition(state, "CONFIRMING")
    state = SocraticPhase.transition(state, "PLANNING")
    expect(state.currentPhase).toBe("PLANNING")
  })

  test("step increments on CONFIRMING -> PLANNING", () => {
    let state = SocraticPhase.create("test-step-inc")
    expect(state.currentStep).toBe(0)
    state = SocraticPhase.transition(state, "SOCRATIC")
    state = SocraticPhase.transition(state, "SUMMARIZING")
    state = SocraticPhase.transition(state, "CONFIRMING")
    expect(state.currentStep).toBe(0)
    state = SocraticPhase.transition(state, "PLANNING")
    expect(state.currentStep).toBe(1)
  })

  test("invalid transitions throw with descriptive message", () => {
    const state = SocraticPhase.create("test-invalid")
    expect(() => SocraticPhase.transition(state, "SUMMARIZING")).toThrow(
      /cannot transition from PLANNING to SUMMARIZING/i,
    )
    expect(() => SocraticPhase.transition(state, "CONFIRMING")).toThrow(
      /cannot transition from PLANNING to CONFIRMING/i,
    )
  })

  test("SUMMARIZING is reachable only from SOCRATIC", () => {
    let s = SocraticPhase.create("test-sum-only")
    s = SocraticPhase.transition(s, "HYPOTHESIS")
    expect(() => SocraticPhase.transition(s, "SUMMARIZING")).toThrow()
  })
})

describe("SocraticPhase.toolsForPhase", () => {
  test("returns correct tools for each phase", () => {
    expect(SocraticPhase.toolsForPhase("PLANNING")).toEqual([
      "read",
      "glob",
      "grep",
      "task",
      "transitionPhase",
    ])
    expect(SocraticPhase.toolsForPhase("HYPOTHESIS")).toEqual([
      "read",
      "transitionPhase",
    ])
    expect(SocraticPhase.toolsForPhase("SOCRATIC")).toEqual([
      "debugger_set_breakpoints",
      "debugger_remove_breakpoints",
      "debugger_list_breakpoints",
      "debugger_start_debug_session",
      "debugger_continue_execution",
      "debugger_step_over",
      "debugger_step_into",
      "debugger_step_out",
      "debugger_get_variables",
      "debugger_get_call_stack",
      "debugger_evaluate_expression",
      "read",
      "transitionPhase",
    ])
    expect(SocraticPhase.toolsForPhase("SUMMARIZING")).toEqual(["transitionPhase"])
    expect(SocraticPhase.toolsForPhase("CONFIRMING")).toEqual([
      "debugger_stop_debug_session",
      "transitionPhase",
    ])
  })
})

describe("SocraticPhase.isSocraticAgent", () => {
  test("returns true for 'socratic', false for others", () => {
    expect(SocraticPhase.isSocraticAgent("socratic")).toBe(true)
    expect(SocraticPhase.isSocraticAgent("debug")).toBe(false)
    expect(SocraticPhase.isSocraticAgent("Socratic")).toBe(false)
    expect(SocraticPhase.isSocraticAgent("")).toBe(false)
  })
})

describe("SocraticPhase.isToolAllowed", () => {
  test("returns correct boolean", () => {
    expect(SocraticPhase.isToolAllowed("PLANNING", "read")).toBe(true)
    expect(SocraticPhase.isToolAllowed("PLANNING", "edit")).toBe(false)
    expect(SocraticPhase.isToolAllowed("HYPOTHESIS", "read")).toBe(true)
    expect(SocraticPhase.isToolAllowed("HYPOTHESIS", "debugger_set_breakpoints")).toBe(false)
    expect(SocraticPhase.isToolAllowed("SOCRATIC", "debugger_set_breakpoints")).toBe(true)
    expect(SocraticPhase.isToolAllowed("SOCRATIC", "edit")).toBe(false)
    expect(SocraticPhase.isToolAllowed("SUMMARIZING", "read")).toBe(false)
    expect(SocraticPhase.isToolAllowed("SUMMARIZING", "transitionPhase")).toBe(true)
    expect(SocraticPhase.isToolAllowed("CONFIRMING", "debugger_stop_debug_session")).toBe(true)
  })
})

describe("SocraticPhase storage functions", () => {
  test("get returns undefined for unknown session", () => {
    expect(SocraticPhase.get("nonexistent-session")).toBeUndefined()
  })

  test("getOrCreate returns existing or creates new", () => {
    const id = "test-get-or-create-soc"
    SocraticPhase.clear(id)
    const state1 = SocraticPhase.getOrCreate(id)
    expect(state1.currentPhase).toBe("PLANNING")

    SocraticPhase.transition(state1, "HYPOTHESIS")
    const state2 = SocraticPhase.getOrCreate(id)
    expect(state2.currentPhase).toBe("HYPOTHESIS")
  })

  test("clear removes state", () => {
    const id = "test-clear-soc"
    SocraticPhase.create(id)
    expect(SocraticPhase.get(id)).toBeDefined()
    SocraticPhase.clear(id)
    expect(SocraticPhase.get(id)).toBeUndefined()
  })

  test("setAutoConfirm toggles auto-confirm", () => {
    const id = "test-auto-soc"
    SocraticPhase.create(id)
    expect(SocraticPhase.get(id)!.autoConfirm).toBe(false)
    SocraticPhase.setAutoConfirm(id, true)
    expect(SocraticPhase.get(id)!.autoConfirm).toBe(true)
    SocraticPhase.setAutoConfirm(id, false)
    expect(SocraticPhase.get(id)!.autoConfirm).toBe(false)
  })
})
