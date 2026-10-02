import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

type Health = { status: string }

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: Health }

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    fetch(`${API_URL}/api/health`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Health>
      })
      .then((data) => setState({ kind: 'ok', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        })
      })

    return () => controller.abort()
  }, [])

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-3xl font-bold text-emerald-600">Finance Manager</h1>
      <p className="mt-4 text-slate-700">
        API:{' '}
        {state.kind === 'loading' && 'checking...'}
        {state.kind === 'error' && `unreachable (${state.message})`}
        {state.kind === 'ok' && state.data.status}
      </p>
    </main>
  )
}
