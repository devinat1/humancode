import { Socket } from "net"
import type { DapMessage, Event, Request, Response } from "./types"

type EventHandler = (body: Record<string, unknown>) => void

/**
 * DAP wire protocol client over TCP.
 * Uses Content-Length header framing (same as LSP).
 */
export class DapClient {
  private socket: Socket
  private seq = 1
  private pending = new Map<
    number,
    { resolve: (r: Response) => void; reject: (e: Error) => void }
  >()
  private eventHandlers = new Map<string, Set<EventHandler>>()
  private buffer = Buffer.alloc(0)
  private connected = false

  constructor(
    private host: string,
    private port: number,
  ) {
    this.socket = new Socket()
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.connect(this.port, this.host, () => {
        this.connected = true
        resolve()
      })
      this.socket.on("error", (err) => {
        if (!this.connected) reject(err)
      })
      this.socket.on("data", (data) => this.onData(data))
      this.socket.on("close", () => {
        this.connected = false
        for (const [, p] of this.pending) {
          p.reject(new Error("Connection closed"))
        }
        this.pending.clear()
      })
    })
  }

  async sendRequest(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<Response> {
    const seq = this.seq++
    const request: Request = {
      seq,
      type: "request",
      command,
      arguments: args,
    }
    const json = JSON.stringify(request)
    const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`
    return new Promise((resolve, reject) => {
      this.pending.set(seq, { resolve, reject })
      this.socket.write(header + json)
    })
  }

  on(event: string, handler: EventHandler): void {
    let handlers = this.eventHandlers.get(event)
    if (!handlers) {
      handlers = new Set()
      this.eventHandlers.set(event, handlers)
    }
    handlers.add(handler)
  }

  off(event: string, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  once(event: string): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      const handler: EventHandler = (body) => {
        this.off(event, handler)
        resolve(body)
      }
      this.on(event, handler)
    })
  }

  async disconnect(): Promise<void> {
    this.socket.destroy()
    this.connected = false
  }

  private onData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data])
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n")
      if (headerEnd === -1) break

      const header = this.buffer.subarray(0, headerEnd).toString()
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4)
        continue
      }

      const contentLength = parseInt(match[1], 10)
      const contentStart = headerEnd + 4
      if (this.buffer.length < contentStart + contentLength) break

      const content = this.buffer
        .subarray(contentStart, contentStart + contentLength)
        .toString()
      this.buffer = this.buffer.subarray(contentStart + contentLength)

      try {
        const message = JSON.parse(content) as DapMessage
        this.handleMessage(message)
      } catch {
        // Skip malformed messages
      }
    }
  }

  private handleMessage(message: DapMessage): void {
    if (message.type === "response") {
      const response = message as Response
      const pending = this.pending.get(response.request_seq)
      if (pending) {
        this.pending.delete(response.request_seq)
        if (response.success) {
          pending.resolve(response)
        } else {
          pending.reject(
            new Error(response.message ?? `Request failed: ${response.command}`),
          )
        }
      }
    } else if (message.type === "event") {
      const event = message as Event
      const handlers = this.eventHandlers.get(event.event)
      if (handlers) {
        for (const handler of handlers) {
          handler(event.body ?? {})
        }
      }
    }
  }
}
