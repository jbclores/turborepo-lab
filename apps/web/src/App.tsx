import { useQuery } from '@tanstack/react-query'
import { apiGet } from './lib/api'

type Health = { status: string }

export default function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet<Health>('/api/health', signal),
  })

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-3xl font-bold text-emerald-600">Finance Manager</h1>
      <p className="mt-4 text-slate-700">
        API:{' '}
        {health.isPending && 'checking...'}
        {health.isError && `unreachable (${health.error.message})`}
        {health.isSuccess && health.data.status}
      </p>
    </main>
  )
}
