import { parse, serialize } from 'cookie'

export const SESSION_COOKIE = 'sid'

export function readSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined
  return parse(cookieHeader)[SESSION_COOKIE]
}

// HttpOnly: JavaScript cannot read it. SameSite=Lax: not sent on cross-site POSTs.
// Secure: HTTPS only, switched on in production.
export function sessionCookieHeader(token: string, { maxAgeMs, secure }: { maxAgeMs: number; secure: boolean }): string {
  return serialize(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(maxAgeMs / 1000),
    secure,
  })
}

// Tells the browser to drop the cookie: an empty value that expired immediately.
// Path and the other attributes match the cookie that was set, or the browser keeps the old one.
export function clearedSessionCookieHeader({ secure }: { secure: boolean }): string {
  return serialize(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0, secure })
}
