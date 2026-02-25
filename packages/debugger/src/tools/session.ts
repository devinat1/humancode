import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import * as SessionManager from "../session/manager"

export function registerSessionTools(server: McpServer): void {
  server.tool(
    "start_debug_session",
    "Start a new debug session. Launches the program in debug mode and pauses at the entry point.",
    {
      type: z
        .string()
        .optional()
        .describe(
          'Debug adapter type: "node" or "python". Auto-detected from file extension if omitted.',
        ),
      program: z.string().describe("Path to the program to debug"),
      args: z
        .array(z.string())
        .optional()
        .describe("Command-line arguments for the program"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory for the program"),
      env: z
        .record(z.string(), z.string())
        .optional()
        .describe("Additional environment variables"),
      runtimeExecutable: z
        .string()
        .optional()
        .describe(
          'Custom runtime executable (e.g. "bun", "tsx", "deno")',
        ),
      runtimeArgs: z
        .array(z.string())
        .optional()
        .describe("Additional arguments passed to the runtime"),
      pythonPath: z
        .string()
        .optional()
        .describe("Path to Python interpreter (default: python3)"),
      module: z
        .string()
        .optional()
        .describe("Python module to run (python -m <module>)"),
    },
    async ({
      type,
      program,
      args,
      cwd,
      env,
      runtimeExecutable,
      runtimeArgs,
      pythonPath,
      module,
    }) => {
      const session = await SessionManager.create({
        type: type ?? "",
        program,
        args,
        cwd,
        env,
        runtimeExecutable,
        runtimeArgs,
        pythonPath,
        module,
      })

      // Wait for the initial --inspect-brk / stopOnEntry pause
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

  server.tool(
    "stop_debug_session",
    "Stop the active debug session and clean up resources.",
    {},
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
