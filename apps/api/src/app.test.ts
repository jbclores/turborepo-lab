import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'
import { apiErrorSchema, healthResponseSchema } from '@lab/schemas'
import type { Express } from 'express'
import type { AddressInfo } from 'node:net'
import { createApp } from './app.js'

type RunningApp = { baseUrl: string; close: () => Promise<void> }

async function start(app: Express): Promise<RunningApp> {
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  return {
    baseUrl: `http://localhost:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  }
}

let running: RunningApp
let baseUrl: string

beforeAll(async () => {
  running = await start(createApp({ webOrigin: 'http://localhost:5173' }))
  baseUrl = running.baseUrl
})

afterAll(() => running.close())

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

describe('createApp', () => {
  let custom: RunningApp
  let customUrl: string

  beforeAll(async () => {
    custom = await start(createApp({ webOrigin: 'http://localhost:9999' }))
    customUrl = custom.baseUrl
  })

  afterAll(() => custom.close())

  test('allows the web origin it is given', async () => {
    const res = await fetch(`${customUrl}/api/health`, {
      headers: { Origin: 'http://localhost:9999' },
    })

    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:9999')
  })

  test('does not allow the default web origin when given another one', async () => {
    const res = await fetch(`${customUrl}/api/health`, {
      headers: { Origin: 'http://localhost:5173' },
    })

    expect(res.headers.get('access-control-allow-origin')).not.toBe('http://localhost:5173')
  })
})
