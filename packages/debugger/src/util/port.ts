import { createServer, Socket } from "net"

/**
 * Find a free port by binding to port 0 and reading the assigned port.
 */
export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      if (typeof addr === "object" && addr !== null) {
        const port = addr.port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error("Failed to get port")))
      }
    })
    server.on("error", reject)
  })
}

/**
 * Wait for a port to become available by polling with TCP connect attempts.
 */
export function waitForPort(
  port: number,
  timeout = 10000,
  host = "127.0.0.1",
): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    function attempt() {
      if (Date.now() - start > timeout) {
        reject(new Error(`Timed out waiting for port ${port}`))
        return
      }
      const socket = new Socket()
      socket.once("connect", () => {
        socket.destroy()
        resolve()
      })
      socket.once("error", () => {
        socket.destroy()
        setTimeout(attempt, 100)
      })
      socket.connect(port, host)
    }
    attempt()
  })
}
