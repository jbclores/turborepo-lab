import { zodResolver } from '@hookform/resolvers/zod'
import { loginInputSchema, type AuthResponse } from '@lab/schemas'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { ApiRequestError } from '../lib/api'
import { meQuery } from '../lib/client'
import { safeRedirect } from '../lib/safe-redirect'

type Credentials = { email: string; password: string }

type AuthFormProps = {
  title: string
  submitLabel: string
  // The shared schema from @lab/schemas, so the browser checks the same rules as the API.
  schema: typeof loginInputSchema
  submit: (credentials: Credentials) => Promise<AuthResponse>
  passwordAutoComplete: 'current-password' | 'new-password'
  redirect: string | undefined
  footer: ReactNode
}

export function AuthForm({ title, submitLabel, schema, submit, passwordAutoComplete, redirect, footer }: AuthFormProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const form = useForm<Credentials>({ resolver: zodResolver(schema) })
  const { errors, isSubmitting } = form.formState

  const mutation = useMutation({
    mutationFn: submit,
    onSuccess: async ({ user }) => {
      // The response already says who is signed in, so write it to ['me'] instead of refetching.
      queryClient.setQueryData(meQuery.queryKey, user)
      await navigate({ href: safeRedirect(redirect) })
    },
    onError: (error) => {
      // The API's error codes, mapped onto the form.
      if (error instanceof ApiRequestError && error.code === 'email_taken') {
        form.setError('email', { message: 'An account with this email already exists' })
      } else if (error instanceof ApiRequestError && error.code === 'invalid_credentials') {
        form.setError('root', { message: 'Email or password is incorrect' })
      } else {
        form.setError('root', { message: 'Something went wrong. Please try again.' })
      }
    },
  })

  return (
    <section className="mt-6 text-slate-700">
      <h2 className="text-xl font-semibold">{title}</h2>
      <form
        noValidate
        onSubmit={form.handleSubmit((credentials) => mutation.mutateAsync(credentials).catch(() => {}))}
        className="mt-4 space-y-4"
      >
        <label className="block">
          <span className="block text-sm font-medium">Email</span>
          <input
            type="email"
            autoComplete="email"
            {...form.register('email')}
            aria-invalid={errors.email ? true : undefined}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          {errors.email && <span className="mt-1 block text-sm text-red-600">{errors.email.message}</span>}
        </label>
        <label className="block">
          <span className="block text-sm font-medium">Password</span>
          <input
            type="password"
            autoComplete={passwordAutoComplete}
            {...form.register('password')}
            aria-invalid={errors.password ? true : undefined}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
          {errors.password && <span className="mt-1 block text-sm text-red-600">{errors.password.message}</span>}
        </label>
        {errors.root && (
          <p role="alert" className="text-sm text-red-600">
            {errors.root.message}
          </p>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </form>
      <p className="mt-6 text-sm">{footer}</p>
    </section>
  )
}
