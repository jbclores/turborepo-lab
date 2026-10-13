import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { meQuery } from './client'
import { safeRedirect } from './safe-redirect'

export type GuestSearch = { redirect?: string }

// Shared by /login and /register: keep ?redirect= only when it is a string; safeRedirect checks it later.
export function validateGuestSearch(search: Record<string, unknown>): GuestSearch {
  return typeof search.redirect === 'string' ? { redirect: search.redirect } : {}
}

// Someone already signed in has no business on /login or /register: send them on.
export async function redirectIfSignedIn(queryClient: QueryClient, search: GuestSearch) {
  const user = await queryClient.ensureQueryData(meQuery)
  if (user) throw redirect({ href: safeRedirect(search.redirect) })
}
