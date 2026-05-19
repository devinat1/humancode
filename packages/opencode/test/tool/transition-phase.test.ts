import { describe, expect, test, beforeEach } from "bun:test"
import { TransitionPhaseTool } from "../../src/tool/transition-phase"
import { SocraticPhase } from "../../src/session/socratic-phase"

const ctx = {
  sessionID: "test-session",
  messageID: "msg-1",
  agent: "socratic",
  abort: AbortSignal.any([]),
  callID: "call-1",
  messages: [] as any[],
  metadata: () => {},
  ask: async () => {},
}

describe("tool.transitionPhase", () => {
  beforeEach(() => {
    SocraticPhase.clear("test-session")
    SocraticPhase.create("test-session")
  })

  test("successful transition from PLANNING to HYPOTHESIS", async () => {
    const tool = await TransitionPhaseTool.init()
    const result = await tool.execute(
      { to: "HYPOTHESIS", reason: "User has not stated hypothesis" },
      ctx,
    )

    expect(result.title).toBe("Phase: HYPOTHESIS")
    expect(result.output).toContain("HYPOTHESIS")
    expect(result.output).toContain("User has not stated hypothesis")
    expect(result.metadata.phase).toBe("HYPOTHESIS")
    expect(result.metadata.step).toBe(0)
  })

  test("successful transition from PLANNING to SOCRATIC (skipping HYPOTHESIS)", async () => {
    const tool = await TransitionPhaseTool.init()
    const result = await tool.execute(
      { to: "SOCRATIC", reason: "User already stated a specific question" },
      ctx,
    )

    expect(result.metadata.phase).toBe("SOCRATIC")
    expect(result.metadata.error).toBe(false)
  })

  test("failed transition from PLANNING to SUMMARIZING", async () => {
    const tool = await TransitionPhaseTool.init()
    const result = await tool.execute(
      { to: "SUMMARIZING", reason: "Skip ahead" },
      ctx,
    )

    expect(result.title).toBe("Transition Failed")
    expect(result.output).toContain("Cannot transition")
    expect(result.output).toContain("PLANNING")
    expect(result.output).toContain("SUMMARIZING")
    expect(result.metadata.error).toBe(true)
  })

  test("parameter 'to' must be a valid phase name", async () => {
    const tool = await TransitionPhaseTool.init()
    try {
      await tool.execute(
        { to: "INVALID_PHASE" as any, reason: "bad phase" },
        ctx,
      )
      expect(true).toBe(false)
    } catch (e: any) {
      expect(e).toBeInstanceOf(Error)
      expect(e.message).toContain("invalid")
    }
  })

  test("step increments when cycling from CONFIRMING back to PLANNING", async () => {
    const tool = await TransitionPhaseTool.init()

    // Walk through the full cycle (HYPOTHESIS skipped for brevity):
    // PLANNING -> SOCRATIC -> SUMMARIZING -> CONFIRMING -> PLANNING
    await tool.execute({ to: "SOCRATIC", reason: "step 1" }, ctx)
    await tool.execute({ to: "SUMMARIZING", reason: "step 2" }, ctx)
    await tool.execute({ to: "CONFIRMING", reason: "step 3" }, ctx)

    const result = await tool.execute({ to: "PLANNING", reason: "next slice" }, ctx)

    expect(result.metadata.phase).toBe("PLANNING")
    expect(result.metadata.step).toBe(1)
  })

  test("output includes available tools for the new phase", async () => {
    const tool = await TransitionPhaseTool.init()
    const result = await tool.execute(
      { to: "SOCRATIC", reason: "begin loop" },
      ctx,
    )

    expect(result.output).toContain("Available tools:")
    expect(result.output).toContain("debugger_set_breakpoints")
    expect(result.output).toContain("debugger_continue_execution")
    expect(result.output).toContain("read")
  })
})
