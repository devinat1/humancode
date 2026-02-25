#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createServer } from "./server"
import * as SessionManager from "./session/manager"

const server = createServer()
const transport = new StdioServerTransport()

// Graceful shutdown
process.on("SIGINT", async () => {
  await SessionManager.stopAll()
  await server.close()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  await SessionManager.stopAll()
  await server.close()
  process.exit(0)
})

await server.connect(transport)
