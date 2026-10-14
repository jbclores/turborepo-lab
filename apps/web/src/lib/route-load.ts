import type { QueryClient } from '@tanstack/react-query'
import { notFound, redirect } from '@tanstack/react-router'
import { ApiRequestError } from './api'
import { forgetIfSignedOut } from './me'

// For a protected page's loader: a 401 (the session ended since the guard ran) goes to /login and back,
// a 404 renders the route's not-found component, anything else reaches the error screen.
export async function loadOrRedirect<T>(queryClient: QueryClient, href: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (forgetIfSignedOut(queryClient, error)) throw redirect({ to: '/login', search: { redirect: href } })
    if (error instanceof ApiRequestError && error.status === 404) throw notFound()
    throw error
  }
}
