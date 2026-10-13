const FALLBACK = '/'
// A placeholder origin to resolve against. If the value resolves to any other origin, it leaves the site.
const BASE = 'http://placeholder.invalid'

// Guards ?redirect= after login against an open redirect (a link to our login page that sends
// the user on to another site). A string check is not enough: browsers read '/\evil.example'
// and '/<tab>/evil.example' as '//evil.example', so the value is parsed the way a browser would.
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return FALLBACK
  // Once the browser's own parsing keeps it on this site, the value itself is safe to use.
  return new URL(value, BASE).origin === BASE ? value : FALLBACK
}
