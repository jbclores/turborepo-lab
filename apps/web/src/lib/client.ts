import { queryOptions } from '@tanstack/react-query'
import { createApiGet, createApiPost } from './api'
import { createFetchMe } from './me'

// The only place that reads the Vite env var. Everything else receives the URL as an argument.
const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export const apiGet = createApiGet(baseUrl)
export const apiPost = createApiPost(baseUrl)
const fetchMe = createFetchMe(apiGet)

// The current user (or null when signed out). Read by the route guards and the pages;
// login, register and logout write to it directly instead of refetching.
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: ({ signal }) => fetchMe(signal),
})
