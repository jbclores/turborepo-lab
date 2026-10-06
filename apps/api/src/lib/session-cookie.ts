import { parse } from 'cookie'

export const SESSION_COOKIE = 'sid'

export function readSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined
  return parse(cookieHeader)[SESSION_COOKIE]
}
