import { accountsResponseSchema } from '@lab/schemas'
import { queryOptions } from '@tanstack/react-query'
import { createApiGet, createApiSend } from './api'
import { createFetchMe, ME_QUERY_KEY } from './me'

// The only place that reads the Vite env var. Everything else receives the URL as an argument.
const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export const apiGet = createApiGet(baseUrl)
export const apiSend = createApiSend(baseUrl)
const fetchMe = createFetchMe(apiGet)

// The current user (or null when signed out). Read by the route guards and the pages;
// login, register and logout write to it directly instead of refetching.
export const meQuery = queryOptions({
  queryKey: ME_QUERY_KEY,
  queryFn: ({ signal }) => fetchMe(signal),
})

// This user's accounts. The accounts page invalidates it after every change, so it refetches.
export const accountsQuery = queryOptions({
  queryKey: ['accounts'],
  queryFn: ({ signal }) => apiGet('/api/accounts', accountsResponseSchema, signal).then(({ accounts }) => accounts),
})
