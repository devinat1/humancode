import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerBreakpointTools } from "./tools/breakpoints"
import { registerSessionTools } from "./tools/session"
import { registerExecutionTools } from "./tools/execution"
import { registerInspectionTools } from "./tools/inspection"

export function createServer(): McpServer {
  const server = new McpServer({
    name: "debugger",
    version: "1.0.0",
  })

  registerBreakpointTools(server)
  registerSessionTools(server)
  registerExecutionTools(server)
  registerInspectionTools(server)

  return server
}
