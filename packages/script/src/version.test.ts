import { expect, test } from "bun:test"
import { nextReleaseVersion } from "./version"

test("publishes the source version when it is ahead of the last release", () => {
  expect(
    nextReleaseVersion({
      published: "0.0.45",
      source: "1.18.25",
    }),
  ).toBe("1.18.25")
})

test("patch-bumps when source and published versions match", () => {
  expect(
    nextReleaseVersion({
      published: "1.18.25",
      source: "1.18.25",
    }),
  ).toBe("1.18.26")
})

test("uses an explicit override instead of catch-up or bump", () => {
  expect(
    nextReleaseVersion({
      override: "2.0.0",
      published: "0.0.45",
      source: "1.18.25",
    }),
  ).toBe("2.0.0")
})
