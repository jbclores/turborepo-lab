import { afterEach, describe, expect, test } from '@jest/globals'
import { healthResponseSchema } from '@lab/schemas'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApiGet } from './api.js'

type Handler = (req: IncomingMessage, res: ServerResponse) => void

const servers: Server[] = []

async function serve(handler: Handler): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  return `http://localhost:${(server.address() as AddressInfo).port}`
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  )
})

describe('createApiGet', () => {
  test('returns the parsed body when the response is OK and matches the schema', async () => {
    const baseUrl = await serve((_req, res) => json(res, 200, { status: 'ok' }))
    const apiGet = createApiGet(baseUrl)

    await expect(apiGet('/api/health', healthResponseSchema)).resolves.toEqual({ status: 'ok' })
  })

  test('requests the base URL joined with the path', async () => {
    let requestedUrl: string | undefined
    const baseUrl = await serve((req, res) => {
      requestedUrl = req.url
      json(res, 200, { status: 'ok' })
    })
    const apiGet = createApiGet(baseUrl)

    await apiGet('/api/health', healthResponseSchema)

    expect(requestedUrl).toBe('/api/health')
  })

  test('throws "HTTP 404" when the response is not OK', async () => {
    const baseUrl = await serve((_req, res) => json(res, 404, { message: 'nope' }))
    const apiGet = createApiGet(baseUrl)

    await expect(apiGet('/api/missing', healthResponseSchema)).rejects.toThrow('HTTP 404')
  })

  test('does not run the schema on an error response', async () => {
    let parseCalls = 0
    const countingSchema = {
      parse: (data: unknown) => {
        parseCalls++
        return data
      },
    }
    const baseUrl = await serve((_req, res) => json(res, 500, { message: 'boom' }))
    const apiGet = createApiGet(baseUrl)

    await expect(apiGet('/api/health', countingSchema)).rejects.toThrow('HTTP 500')
    expect(parseCalls).toBe(0)
  })

  test('throws when an OK response does not match the schema', async () => {
    const baseUrl = await serve((_req, res) => json(res, 200, { status: 'down' }))
    const apiGet = createApiGet(baseUrl)

    await expect(apiGet('/api/health', healthResponseSchema)).rejects.toThrow()
  })

  test('rejects when the request is aborted', async () => {
    const baseUrl = await serve((_req, res) => json(res, 200, { status: 'ok' }))
    const apiGet = createApiGet(baseUrl)
    const controller = new AbortController()
    controller.abort()

    await expect(apiGet('/api/health', healthResponseSchema, controller.signal)).rejects.toThrow()
  })

  test('rejects when the server cannot be reached', async () => {
    const baseUrl = await serve((_req, res) => json(res, 200, { status: 'ok' }))
    await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))))
    const apiGet = createApiGet(baseUrl)

    await expect(apiGet('/api/health', healthResponseSchema)).rejects.toThrow()
  })
})
