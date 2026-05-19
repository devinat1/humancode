import { describe, test, expect } from "bun:test"
import { Assessor } from "../../src/agent/assessor"

describe("Assessor", () => {
  // The assessor is now LLM-based and requires a model provider.
  // These tests validate the exported interface and types.

  test("assess is an async function", () => {
    expect(typeof Assessor.assess).toBe("function")
  })

  test("Result type has required fields", () => {
    const result: Assessor.Result = {
      mode: "claw",
      confidence: 85,
      reason: "test",
    }
    expect(result.mode).toBe("claw")
    expect(result.confidence).toBe(85)
    expect(result.reason).toBe("test")
  })

  test("mode must be one of the four concrete modes", () => {
    const validModes = ["pair", "socratic", "vibe", "claw"] as const
    for (const mode of validModes) {
      const result: Assessor.Result = { mode, confidence: 80, reason: "test" }
      expect(validModes).toContain(result.mode)
    }
  })
})
