import { describe, expect, test } from '@jest/globals'
import { QueryClient } from '@tanstack/react-query'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { ApiRequestError } from './api.js'
import { ME_QUERY_KEY } from './me.js'
import { loadOrRedirect } from './route-load.js'

function clientWithData() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(ME_QUERY_KEY, { id: 'a', email: 'ana@example.com', createdAt: '' })
  queryClient.setQueryData(['accounts'], [{ name: "Ana's wallet" }])
  return queryClient
}
const failWith = (error: unknown) => () => Promise.reject(error)

describe('loadOrRedirect', () => {
  test('returns what the load returns', async () => {
    await expect(loadOrRedirect(new QueryClient(), '/accounts', () => Promise.resolve(42))).resolves.toBe(42)
  })

  test('a 401 forgets the cache and redirects to /login, coming back to the page', async () => {
    const queryClient = clientWithData()

    const thrown = await loadOrRedirect(queryClient, '/accounts/x', failWith(new ApiRequestError(401, 'unauthorized', 'x'))).catch((e: unknown) => e)

    expect(isRedirect(thrown)).toBe(true)
    expect(thrown).toMatchObject({ options: { to: '/login', search: { redirect: '/accounts/x' } } })
    expect(queryClient.getQueryData(['accounts'])).toBeUndefined()
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull()
  })

  test("a 404 becomes the route's not-found, and keeps the cache", async () => {
    const queryClient = clientWithData()

    const thrown = await loadOrRedirect(queryClient, '/accounts/x', failWith(new ApiRequestError(404, 'not_found', 'x'))).catch((e: unknown) => e)

    expect(isNotFound(thrown)).toBe(true)
    expect(queryClient.getQueryData(['accounts'])).toBeDefined()
  })

  test.each([
    ['a 500', new ApiRequestError(500, 'internal_error', 'x')],
    ['a network failure', new TypeError('fetch failed')],
  ])('%s is rethrown as it is, for the error screen', async (_label, error) => {
    await expect(loadOrRedirect(clientWithData(), '/accounts', failWith(error))).rejects.toBe(error)
  })
})
