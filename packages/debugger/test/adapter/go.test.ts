import { describe, it, expect } from "bun:test"
import { resolveGoMode, resolveDlvBinary } from "../../src/adapter/go"

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

describe("resolveDlvBinary", () => {
  it("returns config.dlvPath verbatim when provided", () => {
    expect(resolveDlvBinary({ dlvPath: "/custom/path/to/dlv" })).toBe(
      "/custom/path/to/dlv",
    )
  })

  it("returns 'dlv' when no override and binary is on PATH", () => {
    // Simulate PATH lookup with an injected resolver.
    const resolver = (name: string) => (name === "dlv" ? "/usr/local/bin/dlv" : null)
    expect(resolveDlvBinary({}, resolver)).toBe("/usr/local/bin/dlv")
  })

  it("throws with install instructions when dlv is missing from PATH", () => {
    const resolver = () => null
    expect(() => resolveDlvBinary({}, resolver)).toThrow(
      /go install github\.com\/go-delve\/delve\/cmd\/dlv@latest/,
    )
  })
})
