import { authResponseSchema, type AuthResponse } from '@lab/schemas'
import type { QueryClient } from '@tanstack/react-query'
import { ApiRequestError, type createApiGet } from './api.js'

export type CurrentUser = AuthResponse['user'] | null

// The query function for ['me']. Being signed out is a normal answer, not a failure: a 401 gives
// null, so the router can redirect to /login. Any other error still throws, so a broken API shows
// an error instead of quietly looking like "signed out".
export function createFetchMe(apiGet: ReturnType<typeof createApiGet>) {
  return async function fetchMe(signal?: AbortSignal): Promise<CurrentUser> {
    try {
      const { user } = await apiGet('/api/auth/me', authResponseSchema, signal)
      return user
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) return null
      throw error
    }
  }
}

export const ME_QUERY_KEY = ['me'] as const

// Called whenever the signed-in user changes (login, register, logout). Anything cached belonged to
// the previous user, so it is dropped before the new user is stored; otherwise the next person on this
// browser could briefly see the last person's accounts.
export function switchUser(queryClient: QueryClient, user: CurrentUser): void {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0] })
  queryClient.setQueryData(ME_QUERY_KEY, user)
}
