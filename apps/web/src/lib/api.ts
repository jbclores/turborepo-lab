const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

// fetch only rejects when no response arrives; HTTP errors (404, 500) still resolve.
// TanStack Query needs a thrown error to enter its error state, so throw on !res.ok.
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}
