import { test, expect, describe } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Agent } from "../../src/agent/agent"
import { Standards } from "../../src/agent/standards"

describe("multi-mode system", () => {
  test("expected primary agents are registered; debug/build/plan are not", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agents = await Agent.list()
        const visible = agents.filter((a) => a.mode !== "subagent" && a.hidden !== true)
        const names = visible.map((a) => a.name)
        expect(names).toContain("pair")
        expect(names).toContain("socratic")
        expect(names).toContain("vibe")
        expect(names).toContain("claw")
        expect(names).toContain("adaptive")
        expect(names).not.toContain("debug")
        expect(names).not.toContain("build")
        expect(names).not.toContain("plan")
      },
    })
  })

  test("Tab cycle order is pair, socratic, vibe, claw, adaptive", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agents = await Agent.list()
        const visible = agents.filter((a) => a.mode !== "subagent" && a.hidden !== true)
        const names = visible.map((a) => a.name)
        const pairIdx = names.indexOf("pair")
        const socIdx = names.indexOf("socratic")
        const vibeIdx = names.indexOf("vibe")
        const clawIdx = names.indexOf("claw")
        const adaptiveIdx = names.indexOf("adaptive")
        expect(pairIdx).toBeLessThan(socIdx)
        expect(socIdx).toBeLessThan(vibeIdx)
        expect(vibeIdx).toBeLessThan(clawIdx)
        expect(clawIdx).toBeLessThan(adaptiveIdx)
      },
    })
  })

  test("default agent is socratic when no config override", async () => {
    await using tmp = await tmpdir({ config: {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const def = await Agent.defaultAgent()
        expect(def).toBe("socratic")
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

  test("each primary mode has distinct color", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const pair = await Agent.get("pair")
        const socratic = await Agent.get("socratic")
        const vibe = await Agent.get("vibe")
        const claw = await Agent.get("claw")
        const adaptive = await Agent.get("adaptive")
        const colors = [pair?.color, socratic?.color, vibe?.color, claw?.color, adaptive?.color]
        const unique = new Set(colors)
        expect(unique.size).toBe(5)
      },
    })
  })

  test("socratic agent is registered as primary", async () => {
    await using tmp = await tmpdir({ config: {} })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agent = await Agent.get("socratic")
        expect(agent).toBeDefined()
        expect(agent!.mode).toBe("primary")
        expect(agent!.steps).toBe(200)
        expect(agent!.color).toBe("#E06C75")
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

  test("socratic prompt contains phase workflow and socratic constraints", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const socratic = await Agent.get("socratic")
        expect(socratic?.prompt).toContain("<IDENTITY>")
        expect(socratic?.prompt).toContain("<HARD-CONSTRAINTS>")
        expect(socratic?.prompt).toContain("PLANNING")
        expect(socratic?.prompt).toContain("HYPOTHESIS")
        expect(socratic?.prompt).toContain("SOCRATIC")
        expect(socratic?.prompt).toContain("SUMMARIZING")
        expect(socratic?.prompt).toContain("one breakpoint")
        expect(socratic?.prompt).toContain("ONE question")
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
