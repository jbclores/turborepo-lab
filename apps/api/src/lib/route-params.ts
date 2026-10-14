// Postgres throws on a malformed uuid, so anything else is answered as "not found" before any query.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A route param as a UUID, or null. Express 5 types params loosely (string | string[] | undefined).
export function uuidParam(param: unknown): string | null {
  return typeof param === 'string' && UUID.test(param) ? param : null
}
