import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js"
import * as SessionManager from "../session/manager"
import type { StopResult } from "../adapter/base"

function formatStopResult(result: StopResult): string {
  if (result.terminated) {
    return JSON.stringify({
      status: "terminated",
      message: "Program has terminated.",
    })
  }
  return JSON.stringify({
    status: "stopped",
    reason: result.reason,
    threadId: result.threadId,
    location: result.location,
  })
}

export function registerExecutionTools(server: McpServer): void {
  server.registerTool(
    "continue_execution",
    {
      description:
        "Continue program execution until the next breakpoint or program termination.",
      inputSchema: {
        threadId: z
          .number()
          .optional()
          .describe("Thread ID to continue. Uses the stopped thread if omitted."),
      } as unknown as ZodRawShapeCompat,
    },
    async ({ threadId }: { threadId?: number }) => {
      const session = SessionManager.requireActive()
      const result = await session.adapter.continue(threadId)
      return {
        content: [{ type: "text" as const, text: formatStopResult(result) }],
      }
    },
  )

  server.registerTool(
    "step_over",
    {
      description:
        "Step over the current line, executing it and stopping at the next line in the same scope.",
      inputSchema: {
        threadId: z
          .number()
          .optional()
          .describe("Thread ID. Uses the stopped thread if omitted."),
      } as unknown as ZodRawShapeCompat,
    },
    async ({ threadId }: { threadId?: number }) => {
      const session = SessionManager.requireActive()
      const result = await session.adapter.stepOver(threadId)
      return {
        content: [{ type: "text" as const, text: formatStopResult(result) }],
      }
    },
  )

  server.registerTool(
    "step_into",
    {
      description: "Step into the function call on the current line.",
      inputSchema: {
        threadId: z
          .number()
          .optional()
          .describe("Thread ID. Uses the stopped thread if omitted."),
      } as unknown as ZodRawShapeCompat,
    },
    async ({ threadId }: { threadId?: number }) => {
      const session = SessionManager.requireActive()
      const result = await session.adapter.stepIn(threadId)
      return {
        content: [{ type: "text" as const, text: formatStopResult(result) }],
      }
    },
  )

  server.registerTool(
    "step_out",
    {
      description: "Step out of the current function, returning to the caller.",
      inputSchema: {
        threadId: z
          .number()
          .optional()
          .describe("Thread ID. Uses the stopped thread if omitted."),
      } as unknown as ZodRawShapeCompat,
    },
    async ({ threadId }: { threadId?: number }) => {
      const session = SessionManager.requireActive()
      const result = await session.adapter.stepOut(threadId)
      return {
        content: [{ type: "text" as const, text: formatStopResult(result) }],
      }
    },
  )
}
