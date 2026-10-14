import { afterEach, describe, expect, test } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { ApiRequestError, createApiGet } from './api.js'
import { createFetchMe, ME_QUERY_KEY, switchUser } from './me.js'
import { closeServers, json, serve } from '../test-support/http-server.js'

const user = { id: '7f3c2a8e-1b4d-4c6a-9e2f-0a1b2c3d4e5f', email: 'ana@example.com', createdAt: '2026-10-06T00:00:00.000Z' }

afterEach(closeServers)

async function fetchMeAgainst(handler: Parameters<typeof serve>[0]) {
  return createFetchMe(createApiGet(await serve(handler)))
}

describe('fetchMe (the ["me"] query function)', () => {
  test('asks GET /api/auth/me and returns the user', async () => {
    let requested: string | undefined
    const fetchMe = await fetchMeAgainst((req, res) => {
      requested = `${req.method} ${req.url}`
      json(res, 200, { user })
    })

    await expect(fetchMe()).resolves.toEqual(user)
    expect(requested).toBe('GET /api/auth/me')
  })

  test('returns null when signed out (401), instead of failing', async () => {
    const fetchMe = await fetchMeAgainst((_req, res) =>
      json(res, 401, { error: { code: 'unauthorized', message: 'Authentication required' } }),
    )

    await expect(fetchMe()).resolves.toBeNull()
  })

  test('fails on any other error, so a broken API is not mistaken for "signed out"', async () => {
    const fetchMe = await fetchMeAgainst((_req, res) =>
      json(res, 500, { error: { code: 'internal_error', message: 'Something went wrong' } }),
    )

    const error = await fetchMe().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 500 })
  })

  test('fails when the API cannot be reached', async () => {
    const fetchMe = await fetchMeAgainst((_req, res) => json(res, 200, { user }))
    await closeServers()

    await expect(fetchMe()).rejects.toThrow()
  })

  test('fails when the response does not match the schema (a leaked passwordHash)', async () => {
    const fetchMe = await fetchMeAgainst((_req, res) => json(res, 200, { user: { ...user, passwordHash: 'x' } }))

    await expect(fetchMe()).rejects.toThrow()
  })

  test('passes the abort signal on, so TanStack Query can cancel it', async () => {
    const fetchMe = await fetchMeAgainst((_req, res) => json(res, 200, { user }))
    const controller = new AbortController()
    controller.abort()

    await expect(fetchMe(controller.signal)).rejects.toThrow()
  })
})

describe('switchUser', () => {
  test("forgets everything cached for the previous user and stores the new one", () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['accounts'], [{ name: "Ana's wallet" }])
    queryClient.setQueryData(['health'], { status: 'ok' })
    queryClient.setQueryData(ME_QUERY_KEY, { id: 'a', email: 'ana@example.com', createdAt: '' })

    switchUser(queryClient, { id: 'b', email: 'ben@example.com', createdAt: '' })

    expect(queryClient.getQueryData(['accounts'])).toBeUndefined()
    expect(queryClient.getQueryData(['health'])).toBeUndefined()
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual({ id: 'b', email: 'ben@example.com', createdAt: '' })
  })

  test('stores null when signing out', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['accounts'], [])

    switchUser(queryClient, null)

    expect(queryClient.getQueryData(['accounts'])).toBeUndefined()
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull()
  })
})
