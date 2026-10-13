import { afterEach, describe, expect, jest, test } from '@jest/globals'
import { accountResponseSchema, authResponseSchema, healthResponseSchema } from '@lab/schemas'
import { ApiRequestError, createApiGet, createApiSend } from './api.js'
import { closeServers, json, readBody, serve } from '../test-support/http-server.js'

afterEach(async () => {
  jest.restoreAllMocks()
  await closeServers()
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
    await closeServers()
    const apiGet = createApiGet(baseUrl)

    await expect(apiGet('/api/health', healthResponseSchema)).rejects.toThrow()
  })
})

describe('createApiGet: cookies and errors', () => {
  test("sends credentials: 'include', so the browser attaches the session cookie", async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    const baseUrl = await serve((_req, res) => json(res, 200, { status: 'ok' }))

    await createApiGet(baseUrl)('/api/health', healthResponseSchema)

    expect(fetchSpy.mock.calls[0]?.[1]?.credentials).toBe('include')
  })

  test('throws an ApiRequestError with the status, code and message of a shared error body', async () => {
    const baseUrl = await serve((_req, res) =>
      json(res, 401, { error: { code: 'unauthorized', message: 'Authentication required' } }),
    )

    const error = await createApiGet(baseUrl)('/api/auth/me', healthResponseSchema).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 401, code: 'unauthorized', message: 'Authentication required' })
  })

  test('throws an ApiRequestError with no code when the error body is not the shared shape', async () => {
    const baseUrl = await serve((_req, res) => json(res, 404, { message: 'nope' }))

    const error = await createApiGet(baseUrl)('/api/missing', healthResponseSchema).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 404, code: undefined, message: 'HTTP 404' })
  })

  test('throws an ApiRequestError when the error body is not JSON at all (a proxy page)', async () => {
    const baseUrl = await serve((_req, res) => {
      res.writeHead(502, { 'content-type': 'text/html' })
      res.end('<h1>Bad Gateway</h1>')
    })

    const error = await createApiGet(baseUrl)('/api/health', healthResponseSchema).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 502, code: undefined, message: 'HTTP 502' })
  })
})

describe('createApiSend', () => {
  const user = { id: '7f3c2a8e-1b4d-4c6a-9e2f-0a1b2c3d4e5f', email: 'ana@example.com', createdAt: '2026-10-06T00:00:00.000Z' }

  test('POSTs the body as JSON to the base URL joined with the path, and returns the parsed response', async () => {
    let seen: { method?: string; url?: string; contentType?: string; body?: string } = {}
    const baseUrl = await serve(async (req, res) => {
      seen = { method: req.method, url: req.url, contentType: req.headers['content-type'], body: await readBody(req) }
      json(res, 201, { user })
    })

    const result = await createApiSend(baseUrl)('POST', '/api/auth/register', { email: 'ana@example.com', password: 'x' }, authResponseSchema)

    expect(seen).toEqual({
      method: 'POST',
      url: '/api/auth/register',
      contentType: 'application/json',
      body: JSON.stringify({ email: 'ana@example.com', password: 'x' }),
    })
    expect(result).toEqual({ user })
  })

  test("sends credentials: 'include'", async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    const baseUrl = await serve((_req, res) => json(res, 200, { user }))

    await createApiSend(baseUrl)('POST', '/api/auth/login', {}, authResponseSchema)

    expect(fetchSpy.mock.calls[0]?.[1]?.credentials).toBe('include')
  })

  test('resolves undefined for a 204 when no schema is given, and sends no body', async () => {
    let seen: { contentType?: string; body?: string } = {}
    const baseUrl = await serve(async (req, res) => {
      seen = { contentType: req.headers['content-type'], body: await readBody(req) }
      res.writeHead(204)
      res.end()
    })

    await expect(createApiSend(baseUrl)('POST', '/api/auth/logout')).resolves.toBeUndefined()
    expect(seen).toEqual({ contentType: undefined, body: '' })
  })

  test('throws an ApiRequestError with the code of a shared error body (409 email_taken)', async () => {
    const baseUrl = await serve((_req, res) =>
      json(res, 409, { error: { code: 'email_taken', message: 'Email already registered' } }),
    )

    const error = await createApiSend(baseUrl)('POST', '/api/auth/register', {}, authResponseSchema).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 409, code: 'email_taken', message: 'Email already registered' })
  })

  test('throws when an OK response does not match the schema (a leaked passwordHash)', async () => {
    const baseUrl = await serve((_req, res) => json(res, 200, { user: { ...user, passwordHash: '$2b$12$...' } }))

    await expect(createApiSend(baseUrl)('POST', '/api/auth/login', {}, authResponseSchema)).rejects.toThrow()
  })
})

describe('createApiSend: PATCH and DELETE', () => {
  test.each(['PATCH', 'DELETE'] as const)('sends %s with the method it was given', async (method) => {
    let seen: string | undefined
    const baseUrl = await serve((req, res) => {
      seen = req.method
      res.writeHead(204)
      res.end()
    })

    await createApiSend(baseUrl)(method, '/api/accounts/1')

    expect(seen).toBe(method)
  })

  test('PATCH sends the JSON body and parses the response', async () => {
    const account = { id: '7f3c2a8e-1b4d-4c6a-9e2f-0a1b2c3d4e5f', name: 'Purse', type: 'cash', createdAt: '2026-10-13T00:00:00.000Z' }
    let body: string | undefined
    const baseUrl = await serve(async (req, res) => {
      body = await readBody(req)
      json(res, 200, { account })
    })

    const result = await createApiSend(baseUrl)('PATCH', '/api/accounts/1', { name: 'Purse' }, accountResponseSchema)

    expect(body).toBe(JSON.stringify({ name: 'Purse' }))
    expect(result).toEqual({ account })
  })

  test('a 404 on DELETE throws an ApiRequestError with the code not_found', async () => {
    const baseUrl = await serve((_req, res) => json(res, 404, { error: { code: 'not_found', message: 'Account not found' } }))

    await expect(createApiSend(baseUrl)('DELETE', '/api/accounts/1')).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })
})
