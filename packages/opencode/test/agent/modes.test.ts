import { test, expect, describe } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Agent } from "../../src/agent/agent"
import { Standards } from "../../src/agent/standards"

describe("multi-mode system", () => {
  test("all five modes are registered as primary agents", async () => {
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
        expect(names).toContain("adaptive")
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

  test("adaptive agent is registered as primary", async () => {
    await using tmp = await tmpdir({ config: {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agent = await Agent.get("adaptive")
        expect(agent).toBeDefined()
        expect(agent!.mode).toBe("primary")
        expect(agent!.steps).toBe(500)
        expect(agent!.color).toBe("#D19A66")
      },
    })
  })

  test("Tab cycle includes adaptive after claw", async () => {
    await using tmp = await tmpdir({ config: {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agents = await Agent.list()
        const visible = agents.filter((a) => a.mode !== "subagent" && !a.hidden)
        const names = visible.map((a) => a.name)
        expect(names.indexOf("adaptive")).toBe(names.indexOf("claw") + 1)
      },
    })
  })

  test("pair prompt contains IDENTITY, HARD-CONSTRAINTS, and SELF-CHECK sections", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const pair = await Agent.get("pair")
        expect(pair?.prompt).toContain("<IDENTITY>")
        expect(pair?.prompt).toContain("<HARD-CONSTRAINTS>")
        expect(pair?.prompt).toContain("<SELF-CHECK>")
        expect(pair?.prompt).toContain("NEVER produce code blocks")
      },
    })
  })

  test("debug prompt contains phase workflow and debugger constraints", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const debug = await Agent.get("debug")
        expect(debug?.prompt).toContain("<IDENTITY>")
        expect(debug?.prompt).toContain("<HARD-CONSTRAINTS>")
        expect(debug?.prompt).toContain("PLANNING")
        expect(debug?.prompt).toContain("BREAKPOINTING")
        expect(debug?.prompt).toContain("NEVER write more than one logical step")
      },
    })
  })

  test("claw prompt contains autonomous workflow and self-review", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const claw = await Agent.get("claw")
        expect(claw?.prompt).toContain("<IDENTITY>")
        expect(claw?.prompt).toContain("<HARD-CONSTRAINTS>")
        expect(claw?.prompt).toContain("self-review")
        expect(claw?.prompt).toContain("NEVER ask for confirmation")
      },
    })
  })

  test("vibe prompt contains task parsing and review requirements", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const vibe = await Agent.get("vibe")
        expect(vibe?.prompt).toContain("<IDENTITY>")
        expect(vibe?.prompt).toContain("<HARD-CONSTRAINTS>")
        expect(vibe?.prompt).toContain("review sub-agent")
        expect(vibe?.prompt).toContain("task list")
      },
    })
  })

  test("adaptive prompt contains complexity assessment and transition rules", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const adaptive = await Agent.get("adaptive")
        expect(adaptive?.prompt).toContain("<IDENTITY>")
        expect(adaptive?.prompt).toContain("<HARD-CONSTRAINTS>")
        expect(adaptive?.prompt).toContain("mode transition")
        expect(adaptive?.prompt).toContain("complexity")
      },
    })
  })
})
