import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js"
import * as SessionManager from "../session/manager"

export function registerSessionTools(server: McpServer): void {
  server.registerTool(
    "start_debug_session",
    {
      description:
        "Start a new debug session. Launches the program in debug mode and pauses at the entry point.",
      inputSchema: {
        type: z
          .string()
          .optional()
          .describe(
            'Debug adapter type: "node" or "python". Auto-detected from file extension if omitted.',
          ),
        program: z.string().describe("Path to the program to debug"),
        args: z.array(z.string()).optional().describe("Command-line arguments for the program"),
        cwd: z.string().optional().describe("Working directory for the program"),
        env: z.record(z.string(), z.string()).optional().describe("Additional environment variables"),
        runtimeExecutable: z
          .string()
          .optional()
          .describe('Custom runtime executable (e.g. "bun", "tsx", "deno")'),
        runtimeArgs: z.array(z.string()).optional().describe("Additional arguments passed to the runtime"),
        pythonPath: z.string().optional().describe("Path to Python interpreter (default: python3)"),
        module: z.string().optional().describe("Python module to run (python -m <module>)"),
      } as unknown as ZodRawShapeCompat,
    },
    async (args) => {
      const {
        type,
        program,
        args: programArgs,
        cwd,
        env,
        runtimeExecutable,
        runtimeArgs,
        pythonPath,
        module,
      } = args as {
        type?: string
        program: string
        args?: string[]
        cwd?: string
        env?: Record<string, string>
        runtimeExecutable?: string
        runtimeArgs?: string[]
        pythonPath?: string
        module?: string
      }
      const session = await SessionManager.create({
        type: type ?? "",
        program,
        args: programArgs,
        cwd,
        env,
        runtimeExecutable,
        runtimeArgs,
        pythonPath,
        module,
      })

      const initialStop = await session.adapter.waitForInitialPause()

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              sessionId: session.id,
              adapterType: session.adapter.id,
              status: "started",
              stoppedAt: initialStop.location,
              message:
                "Debug session started. Program is paused at entry point. Set breakpoints and use continue_execution to run.",
            }),
          },
        ],
      }
    },
  )

  server.registerTool(
    "stop_debug_session",
    {
      description: "Stop the active debug session and clean up resources.",
      inputSchema: {},
    },
    async () => {
      const session = SessionManager.active()
      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "no_session",
                message: "No active debug session to stop.",
              }),
            },
          ],
        }
      }

      await SessionManager.stop()
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "stopped",
              message: "Debug session stopped.",
            }),
          },
        ],
      }
    },
  )
}
