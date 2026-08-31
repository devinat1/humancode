import { $ } from "bun"
import semver from "semver"
import path from "path"
import { maxVersion, nextReleaseVersion } from "./version"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  OPENCODE_CHANNEL: process.env["OPENCODE_CHANNEL"],
  OPENCODE_BUMP: process.env["OPENCODE_BUMP"],
  OPENCODE_VERSION: process.env["OPENCODE_VERSION"],
  OPENCODE_RELEASE: process.env["OPENCODE_RELEASE"],
}
const CHANNEL = await (async () => {
  if (env.OPENCODE_CHANNEL) return env.OPENCODE_CHANNEL
  if (env.OPENCODE_BUMP) return "latest"
  if (env.OPENCODE_VERSION && !env.OPENCODE_VERSION.startsWith("0.0.0-")) return "latest"
  return await $`git branch --show-current`.text().then((x) => x.trim())
})()
const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.OPENCODE_VERSION) return env.OPENCODE_VERSION
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  const npmVersion = await fetch("https://registry.npmjs.org/humancode/latest")
    .then((res) => (res.ok ? res.json() : { version: "0.0.0" }))
    .then((data) => stringField(data, "version") ?? "0.0.0")
  const ghVersion = await fetch("https://api.github.com/repos/devinat1/humancode/releases/latest")
    .then((res) => (res.ok ? res.json() : { tag_name: "v0.0.0" }))
    .then((data) => (stringField(data, "tag_name") ?? "v0.0.0").replace(/^v/, ""))
  const cliPkg: unknown = await Bun.file(path.resolve(import.meta.dir, "../../opencode/package.json")).json()
  return nextReleaseVersion({
    published: maxVersion(npmVersion, ghVersion),
    source: stringField(cliPkg, "version") ?? "0.0.0",
    bump: env.OPENCODE_BUMP,
  })
})()

const bot = ["actions-user", "opencode", "opencode-agent[bot]"]
const teamPath = path.resolve(import.meta.dir, "../../../.github/TEAM_MEMBERS")
const team = [
  ...(await Bun.file(teamPath)
    .text()
    .then((x) => x.split(/\r?\n/).map((x) => x.trim()))
    .then((x) => x.filter((x) => x && !x.startsWith("#")))),
  ...bot,
]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.OPENCODE_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`opencode script`, JSON.stringify(Script, null, 2))

function stringField(data: unknown, key: string) {
  if (!data || typeof data !== "object") return
  const value = Object.getOwnPropertyDescriptor(data, key)?.value
  if (typeof value === "string") return value
}
