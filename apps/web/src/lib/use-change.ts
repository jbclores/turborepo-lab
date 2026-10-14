import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'
import type { AccountErrorOutcome } from './account-errors'
import { switchUser } from './me'

type ChangeOptions<TValues extends FieldValues> = { setError?: UseFormSetError<TValues>; done?: () => void }

// Runs a change, then refetches ['accounts'] (and everything under it) *before* reporting back, so a
// closing form reveals the new data. `done` says what to close; nothing else on the page is touched.
export function useChange<TValues extends FieldValues>(describe: (error: unknown) => AccountErrorOutcome) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [notice, setNotice] = useState<string | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['accounts'] })

  async function change(run: () => Promise<unknown>, { setError, done }: ChangeOptions<TValues> = {}): Promise<boolean> {
    setNotice(null)
    try {
      await run()
      await refresh()
      done?.()
      return true
    } catch (error) {
      const outcome = describe(error)
      if ('signedOut' in outcome) {
        switchUser(queryClient, null)
        await navigate({ to: '/login', search: { redirect: location.href } })
        return false
      }
      if ('notFound' in outcome) {
        done?.()
        setNotice(outcome.message)
      } else if (setError) {
        // The outcomes only name fields the calling form has ('name' on accounts, 'root' everywhere).
        setError(outcome.field as FieldPath<TValues>, { message: outcome.message })
      } else {
        setNotice(outcome.message)
      }
      await refresh()
      return false
    }
  }

  return { change, notice }
}
