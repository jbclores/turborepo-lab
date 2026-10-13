import { apiErrorSchema } from '@lab/schemas'

// Anything with a parse method, such as a Zod schema. Keeps zod out of this file.
type Parser<T> = { parse: (data: unknown) => T }

// A response that was not OK. code is the shared error code (such as 'email_taken') when the
// body has the shared ApiError shape, so callers can react to it; otherwise it is undefined.
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, code: string | undefined, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

// fetch only rejects when no response arrives; HTTP errors (404, 500) still resolve.
// TanStack Query needs a thrown error to enter its error state, so throw on !res.ok.
// credentials: 'include' makes the browser send and keep the session cookie across origins.
async function request(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, credentials: 'include' })
  if (!res.ok) throw await toApiRequestError(res)
  return res
}

async function toApiRequestError(res: Response): Promise<ApiRequestError> {
  const body: unknown = await res.json().catch(() => undefined)
  const parsed = apiErrorSchema.safeParse(body)
  return parsed.success
    ? new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message)
    : new ApiRequestError(res.status, undefined, `HTTP ${res.status}`)
}

// The base URL is passed in (not read from import.meta.env here) so this stays testable.
export function createApiGet(baseUrl: string) {
  // The schema checks the JSON at runtime, so a changed API shape fails loudly.
  return async function apiGet<T>(path: string, schema: Parser<T>, signal?: AbortSignal): Promise<T> {
    const res = await request(`${baseUrl}${path}`, { signal })
    return schema.parse(await res.json())
  }
}

type Method = 'POST' | 'PATCH' | 'DELETE'

export function createApiSend(baseUrl: string) {
  // With a schema, the JSON response is parsed and returned; without one (such as a 204), nothing is read.
  function apiSend<T>(method: Method, path: string, body: unknown, schema: Parser<T>): Promise<T>
  function apiSend(method: Method, path: string, body?: unknown): Promise<void>
  async function apiSend<T>(method: Method, path: string, body?: unknown, schema?: Parser<T>): Promise<T | void> {
    const res = await request(
      `${baseUrl}${path}`,
      body === undefined
        ? { method }
        : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    )
    if (schema) return schema.parse(await res.json())
  }
  return apiSend
}
