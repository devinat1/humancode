import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { TransitionPhaseTool } from "../../src/tool/transition-phase"
import { SocraticPhase } from "../../src/session/socratic-phase"
import { Truncate } from "../../src/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import type { Tool } from "../../src/tool/tool"

const toolLayer = Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer, testInstanceStoreLayer)
const it = testEffect(toolLayer)

const ctx: Tool.Context = {
  sessionID: "test-session",
  messageID: "msg-1",
  agent: "socratic",
  abort: AbortSignal.any([]),
  callID: "call-1",
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

describe("tool.transitionPhase", () => {
  it.instance("successful transition from PLANNING to HYPOTHESIS", () =>
    Effect.gen(function* () {
      SocraticPhase.clear("test-session")
      SocraticPhase.create("test-session")
      const tool = yield* TransitionPhaseTool
      const def = yield* tool.init()
      const result = yield* def.execute({ to: "HYPOTHESIS", reason: "User has not stated hypothesis" }, ctx)

      expect(result.title).toBe("Phase: HYPOTHESIS")
      expect(result.output).toContain("HYPOTHESIS")
      expect(result.output).toContain("User has not stated hypothesis")
      expect(result.metadata.phase).toBe("HYPOTHESIS")
      expect(result.metadata.step).toBe(0)
    }),
  )

  it.instance("successful transition from PLANNING to SOCRATIC (skipping HYPOTHESIS)", () =>
    Effect.gen(function* () {
      SocraticPhase.clear("test-session")
      SocraticPhase.create("test-session")
      const tool = yield* TransitionPhaseTool
      const def = yield* tool.init()
      const result = yield* def.execute({ to: "SOCRATIC", reason: "User already stated a specific question" }, ctx)

      expect(result.metadata.phase).toBe("SOCRATIC")
      expect(result.metadata.error).toBe(false)
    }),
  )

  it.instance("failed transition from PLANNING to SUMMARIZING", () =>
    Effect.gen(function* () {
      SocraticPhase.clear("test-session")
      SocraticPhase.create("test-session")
      const tool = yield* TransitionPhaseTool
      const def = yield* tool.init()
      const result = yield* def.execute({ to: "SUMMARIZING", reason: "Skip ahead" }, ctx)

      expect(result.title).toBe("Transition Failed")
      expect(result.output).toContain("Cannot transition")
      expect(result.output).toContain("PLANNING")
      expect(result.output).toContain("SUMMARIZING")
      expect(result.metadata.error).toBe(true)
    }),
  )

  it.instance("parameter 'to' must be a valid phase name", () =>
    Effect.gen(function* () {
      SocraticPhase.clear("test-session")
      SocraticPhase.create("test-session")
      const tool = yield* TransitionPhaseTool
      const def = yield* tool.init()
      const exit = yield* def
        .execute({ to: "INVALID_PHASE" as "PLANNING", reason: "bad phase" }, ctx)
        .pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
    }),
  )

  it.instance("step increments when cycling from CONFIRMING back to PLANNING", () =>
    Effect.gen(function* () {
      SocraticPhase.clear("test-session")
      SocraticPhase.create("test-session")
      const tool = yield* TransitionPhaseTool
      const def = yield* tool.init()
      yield* def.execute({ to: "SOCRATIC", reason: "step 1" }, ctx)
      yield* def.execute({ to: "SUMMARIZING", reason: "step 2" }, ctx)
      yield* def.execute({ to: "CONFIRMING", reason: "step 3" }, ctx)
      const result = yield* def.execute({ to: "PLANNING", reason: "next slice" }, ctx)

      expect(result.metadata.phase).toBe("PLANNING")
      expect(result.metadata.step).toBe(1)
    }),
  )

  it.instance("output includes available tools for the new phase", () =>
    Effect.gen(function* () {
      SocraticPhase.clear("test-session")
      SocraticPhase.create("test-session")
      const tool = yield* TransitionPhaseTool
      const def = yield* tool.init()
      const result = yield* def.execute({ to: "SOCRATIC", reason: "begin loop" }, ctx)

      expect(result.output).toContain("Available tools:")
      expect(result.output).toContain("debugger_set_breakpoints")
      expect(result.output).toContain("debugger_continue_execution")
      expect(result.output).toContain("read")
    }),
  )
})
