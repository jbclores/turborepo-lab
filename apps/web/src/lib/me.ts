import { authResponseSchema, type AuthResponse } from '@lab/schemas'
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
