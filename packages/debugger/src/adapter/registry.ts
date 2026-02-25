import type { DebugAdapter } from "./base"
import { NodeAdapter } from "./node"
import { PythonAdapter } from "./python"

type AdapterFactory = () => DebugAdapter

const factories = new Map<string, AdapterFactory>([
  ["node", () => new NodeAdapter()],
  ["python", () => new PythonAdapter()],
])

export function createAdapter(type: string): DebugAdapter {
  const factory = factories.get(type)
  if (!factory) {
    throw new Error(
      `Unknown adapter type: "${type}". Supported: ${[...factories.keys()].join(", ")}`,
    )
  }
  return factory()
}

/**
 * Auto-detect adapter type from file extension.
 */
export function detectType(program: string): string {
  if (program.endsWith(".py")) return "python"
  if (
    program.endsWith(".js") ||
    program.endsWith(".ts") ||
    program.endsWith(".mjs") ||
    program.endsWith(".cjs") ||
    program.endsWith(".tsx") ||
    program.endsWith(".jsx")
  ) {
    return "node"
  }
  throw new Error(
    `Cannot auto-detect debug type for "${program}". Specify type explicitly ("node" or "python").`,
  )
}
