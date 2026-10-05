import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { apiErrorSchema, healthResponseSchema } from '@lab/schemas'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { app } from './app.js'

let server: Server
let baseUrl: string

beforeAll(async () => {
  server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  )
})

describe('GET /api/health', () => {
  test('responds 200 with a body that satisfies the shared schema', async () => {
    const res = await fetch(`${baseUrl}/api/health`)

    expect(res.status).toBe(200)
    expect(healthResponseSchema.parse(await res.json())).toEqual({ status: 'ok' })
  })

  test('is not served at the old root path /health', async () => {
    const res = await fetch(`${baseUrl}/health`)

    expect(res.status).toBe(404)
  })
})

describe('unknown API routes', () => {
  test('respond 404 with a body that satisfies the shared error schema', async () => {
    const res = await fetch(`${baseUrl}/api/nope`)

    expect(res.status).toBe(404)
    expect(apiErrorSchema.parse(await res.json())).toEqual({
      error: { code: 'not_found', message: 'Route not found' },
    })
  })

  test('are served as JSON, not HTML', async () => {
    const res = await fetch(`${baseUrl}/api/nope`)

    expect(res.headers.get('content-type')).toContain('application/json')
  })

  test('outside /api also respond with the JSON error', async () => {
    const res = await fetch(`${baseUrl}/nope`)

    expect(res.status).toBe(404)
    expect(apiErrorSchema.parse(await res.json())).toEqual({
      error: { code: 'not_found', message: 'Route not found' },
    })
  })
})

describe('CORS', () => {
  test('allows the configured web origin', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    })

    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })

  test('does not echo an origin that is not allowed', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'http://evil.example' },
    })

    expect(res.headers.get('access-control-allow-origin')).not.toBe('http://evil.example')
  })

  test('answers a preflight request for the web origin', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
      },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })
})
