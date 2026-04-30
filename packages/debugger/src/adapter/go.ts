import type { LaunchConfig } from "./base"

/**
 * Decide whether to run dlv in `debug` or `test` mode.
 *
 * Rules:
 * 1. If config.goMode is set, use it.
 * 2. Else if program ends in `_test.go`, return "test".
 * 3. Else return "debug".
 *
 * Note: A Go *package path* (e.g. "./cmd/server") cannot be auto-classified
 * as a test target — pass goMode: "test" explicitly if you mean to test it.
 */
export function resolveGoMode(config: LaunchConfig): "debug" | "test" {
  if (config.goMode) return config.goMode
  if (config.program.endsWith("_test.go")) return "test"
  return "debug"
}

type PathResolver = (name: string) => string | null

/**
 * Resolve the path to the `dlv` binary.
 *
 * - If `dlvPath` is provided, return it verbatim (caller is responsible for it).
 * - Otherwise look up `dlv` on PATH via the supplied resolver (defaults to Bun.which).
 * - If absent, throw with install instructions.
 *
 * The resolver is injectable for testability; production callers omit it.
 */
export function resolveDlvBinary(
  opts: { dlvPath?: string },
  resolver: PathResolver = (name) => Bun.which(name),
): string {
  if (opts.dlvPath) return opts.dlvPath
  const found = resolver("dlv")
  if (found) return found
  throw new Error(
    "Delve (dlv) not found on PATH. Install with:\n" +
      "  go install github.com/go-delve/delve/cmd/dlv@latest\n" +
      "Or pass dlvPath in the launch config.",
  )
}
