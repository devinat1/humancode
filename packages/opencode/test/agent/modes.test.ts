import { test, expect, describe } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Agent } from "../../src/agent/agent"
import { Assessor } from "../../src/agent/assessor"
import { Standards } from "../../src/agent/standards"

describe("multi-mode system", () => {
  test("all four modes are registered as primary agents", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agents = await Agent.list()
        const visible = agents.filter((a) => a.mode !== "subagent" && a.hidden !== true)
        const names = visible.map((a) => a.name)
        expect(names).toContain("pair")
        expect(names).toContain("debug")
        expect(names).toContain("vibe")
        expect(names).toContain("claw")
        expect(names).not.toContain("build")
        expect(names).not.toContain("plan")
      },
    })
  })

  test("Tab cycle order is pair, debug, vibe, claw", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agents = await Agent.list()
        const visible = agents.filter((a) => a.mode !== "subagent" && a.hidden !== true)
        const names = visible.map((a) => a.name)
        const pairIdx = names.indexOf("pair")
        const debugIdx = names.indexOf("debug")
        const vibeIdx = names.indexOf("vibe")
        const clawIdx = names.indexOf("claw")
        expect(pairIdx).toBeLessThan(debugIdx)
        expect(debugIdx).toBeLessThan(vibeIdx)
        expect(vibeIdx).toBeLessThan(clawIdx)
      },
    })
  })

  test("review agent is registered as hidden subagent", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const review = await Agent.get("review")
        expect(review).toBeDefined()
        expect(review?.mode).toBe("subagent")
        expect(review?.hidden).toBe(true)
      },
    })
  })

  test("assessor recommends pair for learning prompts", () => {
    const result = Assessor.analyze("explain how providers work")
    expect(result.mode).toBe("pair")
  })

  test("assessor recommends claw for simple tasks", () => {
    const result = Assessor.analyze("fix typo in README.md")
    expect(result.mode).toBe("claw")
  })

  test("assessor recommends vibe for multiple tasks", () => {
    const result = Assessor.analyze("fix the lint warnings and add tests for session.ts")
    expect(result.mode).toBe("vibe")
  })

  test("standards prompt loads for review agent", async () => {
    const config = Standards.Config.parse({
      standards: { clean: true, solid: true },
      custom: [],
    })
    const result = await Standards.prompt(config)
    expect(result).toContain("Clean Code Foundations")
    expect(result).toContain("SOLID Principles")
  })

  test("each mode has distinct color", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const pair = await Agent.get("pair")
        const debug = await Agent.get("debug")
        const vibe = await Agent.get("vibe")
        const claw = await Agent.get("claw")
        const colors = [pair?.color, debug?.color, vibe?.color, claw?.color]
        const unique = new Set(colors)
        expect(unique.size).toBe(4)
      },
    })
  })
})
