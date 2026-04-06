import { test, expect, describe } from "bun:test"
import { MODE_CONSTRAINTS } from "../../src/agent/mode-constraints"

describe("MODE_CONSTRAINTS", () => {
  test("contains exactly the five primary modes", () => {
    const keys = Object.keys(MODE_CONSTRAINTS).sort()
    expect(keys).toEqual(["adaptive", "claw", "debug", "pair", "vibe"])
  })

  test("each constraint is a non-empty string", () => {
    for (const [key, value] of Object.entries(MODE_CONSTRAINTS)) {
      expect(typeof value).toBe("string")
      expect(value.length).toBeGreaterThan(0)
    }
  })

  test("pair constraint forbids code blocks and write tools", () => {
    expect(MODE_CONSTRAINTS.pair).toContain("MUST NOT")
    expect(MODE_CONSTRAINTS.pair).toContain("code blocks")
    expect(MODE_CONSTRAINTS.pair).toContain("write/edit")
  })

  test("debug constraint forbids multiple steps", () => {
    expect(MODE_CONSTRAINTS.debug).toContain("MUST NOT")
    expect(MODE_CONSTRAINTS.debug).toContain("one logical step")
  })

  test("vibe constraint requires task parsing and review", () => {
    expect(MODE_CONSTRAINTS.vibe).toContain("MUST")
    expect(MODE_CONSTRAINTS.vibe).toContain("review sub-agent")
  })

  test("claw constraint requires autonomy and self-review", () => {
    expect(MODE_CONSTRAINTS.claw).toContain("MUST")
    expect(MODE_CONSTRAINTS.claw).toContain("self-review")
  })

  test("adaptive constraint requires announcing transitions", () => {
    expect(MODE_CONSTRAINTS.adaptive).toContain("MUST")
    expect(MODE_CONSTRAINTS.adaptive).toContain("mode transition")
  })
})
