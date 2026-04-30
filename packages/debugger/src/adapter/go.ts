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
