import z from "zod"
import path from "path"

export namespace Standards {
  export const Config = z.object({
    standards: z.object({
      clean: z.boolean().default(true),
      solid: z.boolean().default(true),
      oop: z.boolean().default(false),
      bob: z.boolean().default(false),
      typescript_react: z.boolean().default(false),
      ddd: z.boolean().default(false),
    }),
    custom: z.array(z.string()).default([]),
  })

  export type Config = z.infer<typeof Config>

  const DEFAULTS: Config = Config.parse({
    standards: {},
    custom: [],
  })

  // Parse a simple two-level YAML of the form used by standards.yml.
  // Supports boolean scalars and string list items only — no external deps.
  function parseYaml(text: string): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    let currentKey: string | null = null
    let currentList: string[] | null = null

    for (const raw of text.split("\n")) {
      const line = raw.replace(/\r$/, "")

      // Skip comments and blank lines
      if (line.trim() === "" || line.trim().startsWith("#")) continue

      // Top-level key (no leading whitespace, ends with colon)
      const topMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/)
      if (topMatch && !line.startsWith(" ") && !line.startsWith("\t")) {
        if (currentKey !== null && currentList !== null) result[currentKey] = currentList
        currentKey = topMatch[1]
        currentList = null
        const val = topMatch[2].trim()
        if (val !== "") {
          result[currentKey] = parsePrimitive(val)
          currentKey = null
        } else {
          // value is on following lines — start nested object or list
          result[currentKey] = {}
        }
        continue
      }

      // Nested key under a top-level object
      const nestedMatch = line.match(/^[ \t]+([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/)
      if (nestedMatch && currentKey !== null && currentList === null) {
        const parent = result[currentKey]
        if (parent !== null && typeof parent === "object" && !Array.isArray(parent)) {
          ;(parent as Record<string, unknown>)[nestedMatch[1]] = parsePrimitive(nestedMatch[2].trim())
        }
        continue
      }

      // List item under a top-level key
      const listMatch = line.match(/^[ \t]+-\s+(.+)$/)
      if (listMatch && currentKey !== null) {
        if (currentList === null) {
          currentList = []
          result[currentKey] = currentList
        }
        currentList.push(listMatch[1].replace(/^["']|["']$/g, ""))
        continue
      }
    }

    return result
  }

  function parsePrimitive(val: string): unknown {
    if (val === "true") return true
    if (val === "false") return false
    const num = Number(val)
    if (!isNaN(num) && val !== "") return num
    return val.replace(/^["']|["']$/g, "")
  }

  function serializeYaml(config: Config): string {
    const lines: string[] = []
    lines.push("standards:")
    for (const [key, value] of Object.entries(config.standards)) {
      lines.push(`  ${key}: ${value}`)
    }
    lines.push("custom:")
    for (const rule of config.custom) {
      lines.push(`  - "${rule.replace(/"/g, '\\"')}"`)
    }
    return lines.join("\n") + "\n"
  }

  export async function load(directory: string): Promise<Config> {
    const file = Bun.file(path.join(directory, ".humancode", "standards.yml"))
    const exists = await file.exists()
    if (!exists) return DEFAULTS
    const text = await file.text()
    const raw = parseYaml(text)
    return Config.parse(raw)
  }

  export async function save(directory: string, config: Config): Promise<void> {
    const dir = path.join(directory, ".humancode")
    await Bun.write(path.join(dir, "standards.yml"), serializeYaml(config))
  }

  const STANDARD_KEYS: (keyof Config["standards"])[] = ["clean", "solid", "oop", "bob", "typescript_react", "ddd"]

  export async function prompt(config: Config): Promise<string> {
    const parts: string[] = []
    for (const key of STANDARD_KEYS) {
      if (!config.standards[key]) continue
      const file = Bun.file(path.join(import.meta.dirname, "standards", `${key}.md`))
      const text = await file.text()
      parts.push(text)
    }
    for (const rule of config.custom) {
      parts.push(rule)
    }
    return parts.join("\n\n")
  }
}
