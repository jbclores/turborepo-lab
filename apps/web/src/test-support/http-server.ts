import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

// A throwaway HTTP server on a random port, for tests that need a real fetch round trip.
// Test-only: nothing in the app imports this file, so it never reaches the browser bundle.

type Handler = (req: IncomingMessage, res: ServerResponse) => void

const servers: Server[] = []

export async function serve(handler: Handler): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  return `http://localhost:${(server.address() as AddressInfo).port}`
}

// Call from afterEach. Also usable mid-test to make a server unreachable.
export async function closeServers(): Promise<void> {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  )
}

export function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export async function readBody(req: IncomingMessage): Promise<string> {
  let body = ''
  for await (const chunk of req) body += chunk
  return body
}
