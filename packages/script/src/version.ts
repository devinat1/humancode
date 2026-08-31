export function nextReleaseVersion(input: {
  override?: string
  published: string
  source: string
  bump?: string
}) {
  if (input.override) return input.override
  if (compare(input.source, input.published) > 0) return input.source
  return bumpVersion(input.published, input.bump?.toLowerCase())
}

export function maxVersion(left: string, right: string) {
  if (compare(left, right) >= 0) return left
  return right
}

function compare(left: string, right: string) {
  const leftParts = numericParts(left)
  const rightParts = numericParts(right)
  for (let i = 0; i < 3; i++) {
    if (leftParts[i] > rightParts[i]) return 1
    if (leftParts[i] < rightParts[i]) return -1
  }
  return 0
}

function numericParts(version: string) {
  return version.split(".").map((part) => Number(part) || 0)
}

function bumpVersion(version: string, bump?: string) {
  const [major, minor, patch] = numericParts(version)
  if (bump === "major") return `${major + 1}.0.0`
  if (bump === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}
