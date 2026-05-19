import { test, expect, describe } from "bun:test"
import { MODE_CONSTRAINTS } from "../../src/agent/mode-constraints"

describe("MODE_CONSTRAINTS", () => {
  test("contains exactly the five primary modes", () => {
    const keys = Object.keys(MODE_CONSTRAINTS).sort()
    expect(keys).toEqual(["adaptive", "claw", "pair", "socratic", "vibe"])
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

  test("socratic constraint forbids answering for the user", () => {
    expect(MODE_CONSTRAINTS.socratic).toContain("MUST NOT answer")
    expect(MODE_CONSTRAINTS.socratic).toContain("one question at a time")
    expect(MODE_CONSTRAINTS.socratic).toContain("one live breakpoint")
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

import BASE_OPERATIONS from "../../src/agent/prompt/base-operations.txt"

describe("BASE_OPERATIONS", () => {
  test("contains tone and style section", () => {
    expect(BASE_OPERATIONS).toContain("# Tone and style")
  })

  test("contains tool usage policy section", () => {
    expect(BASE_OPERATIONS).toContain("# Tool usage policy")
  })

  test("contains professional objectivity section", () => {
    expect(BASE_OPERATIONS).toContain("# Professional objectivity")
  })

  test("contains code references section", () => {
    expect(BASE_OPERATIONS).toContain("# Code references")
  })

  test("does NOT contain TodoWrite instructions", () => {
    expect(BASE_OPERATIONS).not.toContain("TodoWrite")
  })

  test("does NOT contain 'best coding agent' identity", () => {
    expect(BASE_OPERATIONS).not.toContain("best coding agent")
  })
})

import { LLM } from "../../src/session/llm"

describe("wrapModePrompt", () => {
  test("wraps native mode prompt with CRITICAL-INSTRUCTION tags", () => {
    const agent = { name: "pair", prompt: "You are a pair partner." } as any
    const result = LLM.wrapModePrompt(agent)
    expect(result).toContain("<CRITICAL-INSTRUCTION priority=\"highest\">")
    expect(result).toContain("You are a pair partner.")
    expect(result).toContain("</CRITICAL-INSTRUCTION>")
    expect(result).toContain("REMINDER")
    expect(result).toContain(MODE_CONSTRAINTS.pair)
  })

  test("appends BASE_OPERATIONS after the critical block", () => {
    const agent = { name: "claw", prompt: "You are autonomous." } as any
    const result = LLM.wrapModePrompt(agent)
    const criticalEnd = result!.indexOf("</CRITICAL-INSTRUCTION>")
    const baseStart = result!.indexOf("# Tone and style")
    expect(baseStart).toBeGreaterThan(criticalEnd)
  })

  test("returns undefined when agent has no prompt", () => {
    const agent = { name: "build" } as any
    const result = LLM.wrapModePrompt(agent)
    expect(result).toBeUndefined()
  })

  test("returns unwrapped prompt for non-constrained agents", () => {
    const agent = { name: "explore", prompt: "You are an explorer." } as any
    const result = LLM.wrapModePrompt(agent)
    expect(result).toBe("You are an explorer.")
  })

  test("returns unwrapped prompt for custom user agents", () => {
    const agent = { name: "my-custom-agent", prompt: "Custom instructions." } as any
    const result = LLM.wrapModePrompt(agent)
    expect(result).toBe("Custom instructions.")
  })
})
