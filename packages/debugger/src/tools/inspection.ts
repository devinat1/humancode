import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import * as SessionManager from "../session/manager"

export function registerInspectionTools(server: McpServer): void {
  server.tool(
    "get_variables",
    "Get variables visible in the current scope at the current breakpoint.",
    {
      frameId: z
        .number()
        .optional()
        .describe(
          "Stack frame ID to inspect. Uses the top frame if omitted.",
        ),
      scope: z
        .string()
        .optional()
        .describe(
          'Scope to inspect (e.g. "local", "closure", "global"). Defaults to local variables.',
        ),
      maxDepth: z
        .number()
        .optional()
        .describe(
          "Maximum depth for expanding nested objects. Default: 1.",
        ),
    },
    async ({ frameId, scope, maxDepth }) => {
      const session = SessionManager.requireActive()
      const variables = await session.adapter.getVariables(
        frameId,
        scope,
        maxDepth,
      )

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              variables.map((v) => ({
                name: v.name,
                value: v.value,
                type: v.type,
              })),
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  server.tool(
    "get_call_stack",
    "Get the current call stack showing the chain of function calls that led to the current execution point.",
    {
      threadId: z
        .number()
        .optional()
        .describe(
          "Thread ID to get the call stack for. Uses the stopped thread if omitted.",
        ),
    },
    async ({ threadId }) => {
      const session = SessionManager.requireActive()
      const frames = await session.adapter.getCallStack(threadId)

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              frames.map((f) => ({
                id: f.id,
                name: f.name,
                file: f.source?.path,
                line: f.line,
                column: f.column,
              })),
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  server.tool(
    "evaluate_expression",
    "Evaluate an expression in the context of the current breakpoint. Can access local variables and call functions.",
    {
      expression: z.string().describe("The expression to evaluate"),
      frameId: z
        .number()
        .optional()
        .describe(
          "Stack frame ID for the evaluation context. Uses the top frame if omitted.",
        ),
    },
    async ({ expression, frameId }) => {
      const session = SessionManager.requireActive()
      const result = await session.adapter.evaluate(expression, frameId)

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                result: result.result,
                type: result.type,
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )
}
