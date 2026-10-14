import { healthResponseSchema } from '@lab/schemas'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { apiGet, apiSend, meQuery } from '../lib/client'
import { switchUser } from '../lib/me'

export const Route = createFileRoute('/')({
  // Runs before the page renders, so a signed-out visitor never sees it.
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(meQuery)
    if (!user) throw redirect({ to: '/login', search: { redirect: location.href } })
  },
  component: HomePage,
})

function HomePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: user } = useSuspenseQuery(meQuery)
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet('/api/health', healthResponseSchema, signal),
  })
  const logout = useMutation({
    mutationFn: () => apiSend('POST', '/api/auth/logout'),
    onSuccess: async () => {
      // Signed out first, so the /login guard does not send us straight back here.
      queryClient.setQueryData(meQuery.queryKey, null)
      await navigate({ to: '/login' })
      // Then forget everything that belonged to this user.
      switchUser(queryClient, null)
    },
  })

  // Briefly null between logging out and leaving this page.
  if (!user) return null

  return (
    <section className="mt-6 space-y-4 text-slate-700">
      <p>
        Signed in as <span className="font-medium">{user.email}</span>
      </p>
      <p>
        API:{' '}
        {health.isPending && 'checking...'}
        {health.isError && `unreachable (${health.error.message})`}
        {health.isSuccess && health.data.status}
      </p>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50"
      >
        Log out
      </button>
      {logout.isError && <p className="text-red-600">Could not log out. Please try again.</p>}
    </section>
  )
}
