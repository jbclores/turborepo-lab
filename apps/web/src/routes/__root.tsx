import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet, useRouter } from '@tanstack/react-router'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-3xl font-bold text-emerald-600">Finance Manager</h1>
      <Outlet />
    </main>
  ),
  // Any page that fails to load (the API is down, a 500) lands here instead of the router's raw error.
  errorComponent: LoadError,
})

function LoadError() {
  const router = useRouter()
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-3xl font-bold text-emerald-600">Finance Manager</h1>
      <p role="alert" className="mt-6 text-slate-700">
        This page could not be loaded. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={() => void router.invalidate()}
        className="mt-4 rounded bg-emerald-600 px-4 py-2 text-white"
      >
        Try again
      </button>
    </main>
  )
}
