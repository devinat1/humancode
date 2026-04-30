import { describe, it, expect } from "bun:test"
import { resolveGoMode } from "../../src/adapter/go"

describe("resolveGoMode", () => {
  it("returns 'test' when program ends with _test.go", () => {
    expect(resolveGoMode({ type: "go", program: "foo_test.go" })).toBe("test")
    expect(
      resolveGoMode({ type: "go", program: "/abs/path/bar_test.go" }),
    ).toBe("test")
  })

  it("returns 'debug' for non-test .go files", () => {
    expect(resolveGoMode({ type: "go", program: "main.go" })).toBe("debug")
  })

  it("returns 'debug' for package paths without .go suffix", () => {
    expect(resolveGoMode({ type: "go", program: "./cmd/server" })).toBe(
      "debug",
    )
  })

  it("respects an explicit goMode override", () => {
    expect(
      resolveGoMode({ type: "go", program: "foo_test.go", goMode: "debug" }),
    ).toBe("debug")
    expect(
      resolveGoMode({ type: "go", program: "main.go", goMode: "test" }),
    ).toBe("test")
  })
})
