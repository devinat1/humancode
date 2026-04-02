import { test, expect } from "bun:test"
import * as fs from "fs/promises"
import os from "os"
import path from "path"
import { Standards } from "../../src/agent/standards"

async function tmpdir() {
  const dirpath = path.join(os.tmpdir(), "standards-test-" + Math.random().toString(36).slice(2))
  await fs.mkdir(dirpath, { recursive: true })
  return {
    [Symbol.asyncDispose]: async () => {
      await fs.rm(dirpath, { recursive: true, force: true })
    },
    path: dirpath,
  }
}

test("loads defaults when no config file exists", async () => {
  await using tmp = await tmpdir()
  const config = await Standards.load(tmp.path)
  expect(config.standards.clean).toBe(true)
  expect(config.standards.solid).toBe(true)
  expect(config.standards.oop).toBe(false)
  expect(config.standards.bob).toBe(false)
  expect(config.standards.typescript_react).toBe(false)
  expect(config.standards.ddd).toBe(false)
  expect(config.custom).toEqual([])
})

test("loads config from .humancode/standards.yml", async () => {
  await using tmp = await tmpdir()
  const humancodedir = path.join(tmp.path, ".humancode")
  await fs.mkdir(humancodedir, { recursive: true })
  await Bun.write(
    path.join(humancodedir, "standards.yml"),
    `standards:
  clean: false
  solid: true
  oop: true
  bob: false
  typescript_react: true
  ddd: false
custom:
  - "Always use descriptive variable names"
  - "Prefer composition over inheritance"
`,
  )
  const config = await Standards.load(tmp.path)
  expect(config.standards.clean).toBe(false)
  expect(config.standards.solid).toBe(true)
  expect(config.standards.oop).toBe(true)
  expect(config.standards.bob).toBe(false)
  expect(config.standards.typescript_react).toBe(true)
  expect(config.standards.ddd).toBe(false)
  expect(config.custom).toEqual(["Always use descriptive variable names", "Prefer composition over inheritance"])
})

test("builds review prompt containing Clean Code Foundations when clean=true", async () => {
  const config = Standards.Config.parse({
    standards: {
      clean: true,
      solid: false,
      oop: false,
      bob: false,
      typescript_react: false,
      ddd: false,
    },
    custom: [],
  })
  const result = await Standards.prompt(config)
  expect(result).toContain("Clean Code Foundations")
})

test("includes custom rules in review prompt", async () => {
  const config = Standards.Config.parse({
    standards: {
      clean: false,
      solid: false,
      oop: false,
      bob: false,
      typescript_react: false,
      ddd: false,
    },
    custom: ["Always write tests first", "Keep functions small"],
  })
  const result = await Standards.prompt(config)
  expect(result).toContain("Always write tests first")
  expect(result).toContain("Keep functions small")
})

test("save() writes valid config that can be loaded back", async () => {
  await using tmp = await tmpdir()
  const config = Standards.Config.parse({
    standards: {
      clean: true,
      solid: false,
      oop: true,
      bob: false,
      typescript_react: false,
      ddd: true,
    },
    custom: ["No magic numbers"],
  })
  await Standards.save(tmp.path, config)
  const loaded = await Standards.load(tmp.path)
  expect(loaded.standards.clean).toBe(true)
  expect(loaded.standards.solid).toBe(false)
  expect(loaded.standards.oop).toBe(true)
  expect(loaded.standards.bob).toBe(false)
  expect(loaded.standards.typescript_react).toBe(false)
  expect(loaded.standards.ddd).toBe(true)
  expect(loaded.custom).toEqual(["No magic numbers"])
})
