import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { apiSend, meQuery } from '../lib/client'
import { ME_QUERY_KEY, switchUser } from '../lib/me'

// A pathless layout (the leading _): it adds no URL segment, and every page under
// routes/_authenticated/ is protected by this one beforeLoad.
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(meQuery)
    if (!user) throw redirect({ to: '/login', search: { redirect: location.href } })
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: user } = useSuspenseQuery(meQuery)
  const logout = useMutation({
    mutationFn: () => apiSend('POST', '/api/auth/logout'),
    onSuccess: async () => {
      // 1. Signed out: this layout renders nothing, so no page below it keeps fetching.
      queryClient.setQueryData(ME_QUERY_KEY, null)
      // 2. Leave. The /login guard now sees null and lets us in.
      await navigate({ to: '/login' })
      // 3. Forget everything that belonged to this user.
      switchUser(queryClient, null)
    },
  })

  if (!user) return null

  return (
    <>
      <nav className="mt-4 flex items-center gap-4 text-sm">
        <Link to="/" className="text-emerald-700 [&.active]:font-semibold" activeOptions={{ exact: true }}>
          Home
        </Link>
        <Link to="/accounts" className="text-emerald-700 [&.active]:font-semibold">
          Accounts
        </Link>
        <span className="ml-auto text-slate-500">{user.email}</span>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-50"
        >
          Log out
        </button>
      </nav>
      {logout.isError && <p className="mt-2 text-red-600">Could not log out. Please try again.</p>}
      <Outlet />
    </>
  )
}
