import { test, expect, describe } from "bun:test"
import { SessionPrompt } from "../../src/session/prompt"
import { MODE_CONSTRAINTS } from "../../src/agent/mode-constraints"

describe("buildModeReminder", () => {
  test("returns reminder string for native mode at interval", () => {
    const result = SessionPrompt.buildModeReminder("pair", 5)
    expect(result).toContain("<system-reminder>")
    expect(result).toContain("MODE REMINDER")
    expect(result).toContain("pair")
    expect(result).toContain(MODE_CONSTRAINTS.pair)
    expect(result).toContain("</system-reminder>")
  })

  test("returns undefined when assistant count is not at interval", () => {
    expect(SessionPrompt.buildModeReminder("pair", 3)).toBeUndefined()
    expect(SessionPrompt.buildModeReminder("pair", 7)).toBeUndefined()
  })

  test("returns undefined for zero assistant count", () => {
    expect(SessionPrompt.buildModeReminder("pair", 0)).toBeUndefined()
  })

  test("returns undefined for non-constrained agents", () => {
    expect(SessionPrompt.buildModeReminder("explore", 5)).toBeUndefined()
    expect(SessionPrompt.buildModeReminder("compaction", 10)).toBeUndefined()
  })

  test("returns undefined for custom agents", () => {
    expect(SessionPrompt.buildModeReminder("my-custom", 5)).toBeUndefined()
  })

  test("fires at every multiple of REMINDER_INTERVAL", () => {
    expect(SessionPrompt.buildModeReminder("claw", SessionPrompt.REMINDER_INTERVAL)).toBeDefined()
    expect(SessionPrompt.buildModeReminder("claw", SessionPrompt.REMINDER_INTERVAL * 2)).toBeDefined()
    expect(SessionPrompt.buildModeReminder("claw", SessionPrompt.REMINDER_INTERVAL * 3)).toBeDefined()
  })

  test("REMINDER_INTERVAL is 5", () => {
    expect(SessionPrompt.REMINDER_INTERVAL).toBe(5)
  })
})
