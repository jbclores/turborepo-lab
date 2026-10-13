import { authResponseSchema, registerInputSchema } from '@lab/schemas'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AuthForm } from '../components/auth-form'
import { apiSend } from '../lib/client'
import { redirectIfSignedIn, validateGuestSearch } from '../lib/guest-route'

export const Route = createFileRoute('/register')({
  validateSearch: validateGuestSearch,
  beforeLoad: ({ context, search }) => redirectIfSignedIn(context.queryClient, search),
  component: RegisterPage,
})

function RegisterPage() {
  const { redirect } = Route.useSearch()
  return (
    <AuthForm
      title="Create an account"
      submitLabel="Create account"
      schema={registerInputSchema}
      submit={(credentials) => apiSend('POST', '/api/auth/register', credentials, authResponseSchema)}
      passwordAutoComplete="new-password"
      redirect={redirect}
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" search={{ redirect }} className="text-emerald-700 underline">
            Log in
          </Link>
        </>
      }
    />
  )
}
