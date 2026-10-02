// Anything with a parse method, such as a Zod schema. Keeps zod out of this file.
type Parser<T> = { parse: (data: unknown) => T }

// The base URL is passed in (not read from import.meta.env here) so this stays testable.
export function createApiGet(baseUrl: string) {
  // fetch only rejects when no response arrives; HTTP errors (404, 500) still resolve.
  // TanStack Query needs a thrown error to enter its error state, so throw on !res.ok.
  // The schema checks the JSON at runtime, so a changed API shape fails loudly.
  return async function apiGet<T>(path: string, schema: Parser<T>, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return schema.parse(await res.json())
  }
}
