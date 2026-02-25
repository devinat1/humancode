import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import * as SessionManager from "../session/manager"
import {
  getBreakpointsForFile,
  setBreakpointsForFile,
  getAllBreakpoints,
  toSourceBreakpoints,
  type BreakpointInfo,
} from "../session/state"

export function registerBreakpointTools(server: McpServer): void {
  server.tool(
    "set_breakpoints",
    "Set breakpoints in a source file. Merges with existing breakpoints for the file.",
    {
      file: z.string().describe("Absolute path to the source file"),
      breakpoints: z
        .array(
          z.object({
            line: z.number().describe("Line number (1-based)"),
            column: z.number().optional().describe("Column number (1-based)"),
            condition: z
              .string()
              .optional()
              .describe("Conditional expression for the breakpoint"),
            hitCondition: z
              .string()
              .optional()
              .describe("Hit count condition"),
            logMessage: z
              .string()
              .optional()
              .describe("Log message (logpoint) instead of breaking"),
          }),
        )
        .describe("Breakpoints to set"),
    },
    async ({ file, breakpoints }) => {
      const session = SessionManager.requireActive()

      // Merge with existing breakpoints
      const existing = getBreakpointsForFile(session, file)
      const merged = [...existing]
      for (const bp of breakpoints) {
        const idx = merged.findIndex((e) => e.line === bp.line)
        if (idx >= 0) {
          merged[idx] = { ...bp, verified: false }
        } else {
          merged.push({ ...bp, verified: false })
        }
      }

      // Send to adapter
      const results = await session.adapter.setBreakpoints(
        file,
        toSourceBreakpoints(merged),
      )

      // Update state with results
      const updated: BreakpointInfo[] = merged.map((bp, i) => ({
        ...bp,
        verified: results[i]?.verified ?? false,
        id: results[i]?.id,
        line: results[i]?.line ?? bp.line,
      }))
      setBreakpointsForFile(session, file, updated)

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                file,
                breakpoints: updated.map((bp) => ({
                  line: bp.line,
                  verified: bp.verified,
                  condition: bp.condition,
                })),
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  server.tool(
    "remove_breakpoints",
    "Remove breakpoints from a source file. If lines are specified, only those lines are removed. Otherwise all breakpoints in the file are removed.",
    {
      file: z.string().describe("Absolute path to the source file"),
      lines: z
        .array(z.number())
        .optional()
        .describe("Specific line numbers to remove. Omit to remove all."),
    },
    async ({ file, lines }) => {
      const session = SessionManager.requireActive()

      const existing = getBreakpointsForFile(session, file)
      const remaining = lines
        ? existing.filter((bp) => !lines.includes(bp.line))
        : []

      if (remaining.length > 0) {
        const results = await session.adapter.setBreakpoints(
          file,
          toSourceBreakpoints(remaining),
        )
        const updated: BreakpointInfo[] = remaining.map((bp, i) => ({
          ...bp,
          verified: results[i]?.verified ?? false,
          id: results[i]?.id,
        }))
        setBreakpointsForFile(session, file, updated)
      } else {
        // Remove all — send empty breakpoints
        await session.adapter.setBreakpoints(file, [])
        setBreakpointsForFile(session, file, [])
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              file,
              removed: lines ?? "all",
              remaining: remaining.length,
            }),
          },
        ],
      }
    },
  )

  server.tool(
    "list_breakpoints",
    "List all breakpoints across all files in the active debug session.",
    {},
    async () => {
      const session = SessionManager.requireActive()
      const all = getAllBreakpoints(session)

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(all, null, 2),
          },
        ],
      }
    },
  )
}
