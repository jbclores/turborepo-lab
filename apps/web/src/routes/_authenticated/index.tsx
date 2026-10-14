import { healthResponseSchema } from '@lab/schemas'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { apiGet, meQuery } from '../../lib/client'

export const Route = createFileRoute('/_authenticated/')({
  component: HomePage,
})

function HomePage() {
  const { data: user } = useSuspenseQuery(meQuery)
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet('/api/health', healthResponseSchema, signal),
  })

  return (
    <section className="mt-6 space-y-4 text-slate-700">
      <p>
        Signed in as <span className="font-medium">{user?.email}</span>
      </p>
      <p>
        API:{' '}
        {health.isPending && 'checking...'}
        {health.isError && `unreachable (${health.error.message})`}
        {health.isSuccess && health.data.status}
      </p>
    </section>
  )
}
