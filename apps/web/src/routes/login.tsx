import { authResponseSchema, loginInputSchema } from '@lab/schemas'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AuthForm } from '../components/auth-form'
import { apiSend } from '../lib/client'
import { redirectIfSignedIn, validateGuestSearch } from '../lib/guest-route'

export const Route = createFileRoute('/login')({
  validateSearch: validateGuestSearch,
  beforeLoad: ({ context, search }) => redirectIfSignedIn(context.queryClient, search),
  component: LoginPage,
})

function LoginPage() {
  const { redirect } = Route.useSearch()
  return (
    <AuthForm
      title="Log in"
      submitLabel="Log in"
      schema={loginInputSchema}
      submit={(credentials) => apiSend('POST', '/api/auth/login', credentials, authResponseSchema)}
      passwordAutoComplete="current-password"
      redirect={redirect}
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" search={{ redirect }} className="text-emerald-700 underline">
            Create one
          </Link>
        </>
      }
    />
  )
}
