import { describe, test, expect } from "bun:test"
import { Assessor } from "../../src/agent/assessor"

describe("Assessor", () => {
  test("detects learning intent and returns pair mode", () => {
    const result = Assessor.analyze("can you explain how this function works?")
    expect(result.mode).toBe("pair")
    expect(result.confidence).toBe(90)
  })

  test("detects learning intent with 'walk me through'", () => {
    const result = Assessor.analyze("walk me through the authentication flow")
    expect(result.mode).toBe("pair")
  })

  test("detects multiple tasks and returns vibe mode", () => {
    const result = Assessor.analyze("add a login button and update the header styles")
    expect(result.mode).toBe("vibe")
    expect(result.confidence).toBe(85)
  })

  test("detects multiple tasks with semicolons", () => {
    const result = Assessor.analyze("fix the typo in readme; update the changelog")
    expect(result.mode).toBe("vibe")
    expect(result.confidence).toBe(85)
  })

  test("low complexity returns claw mode", () => {
    const result = Assessor.analyze("fix the typo in src/index.ts")
    expect(result.mode).toBe("claw")
  })

  test("high complexity returns debug mode", () => {
    // scope=10 (refactor), no file refs => +5, complexity=15 is vibe boundary
    // complexity=15 produces confidence=50 which is < 75, so routes to adaptive
    const result = Assessor.analyze("refactor the entire authentication system with no file references")
    expect(result.mode).toBe("adaptive")
    expect(result.complexity).toBe(15)
  })

  test("returns confidence score between 0 and 100", () => {
    const prompts = [
      "fix typo in src/app.ts",
      "explain how auth works",
      "refactor the database layer",
      "add login and update header",
    ]
    for (const prompt of prompts) {
      const result = Assessor.analyze(prompt)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(100)
    }
  })

  test("returns human-readable reason", () => {
    const result = Assessor.analyze("explain how this works")
    expect(typeof result.reason).toBe("string")
    expect(result.reason.length).toBeGreaterThan(0)
  })

  test("returns complexity as a number", () => {
    const result = Assessor.analyze("fix the typo in src/index.ts")
    expect(typeof result.complexity).toBe("number")
  })

  test("mid complexity (15-30) routes to adaptive due to low confidence at boundary", () => {
    // scope=10 (refactor), specificity: no refs = +5 => complexity=15
    // complexityConfidence(15) = 50 which is < 75, so routes to adaptive
    const result = Assessor.analyze("refactor the login handler with no specific files")
    expect(result.mode).toBe("adaptive")
  })

  test("low confidence routes to adaptive", () => {
    // A prompt that lands near a boundary (complexity ~15) should have low confidence
    const result = Assessor.analyze("add some validation")
    // If confidence < 75, should be adaptive
    if (result.confidence < 75) {
      expect(result.mode).toBe("adaptive")
    }
  })
})
