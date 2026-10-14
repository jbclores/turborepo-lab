import type { Account, CreateAccountInput } from '@lab/schemas'
import { accountResponseSchema } from '@lab/schemas'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { UseFormSetError } from 'react-hook-form'
import { AccountForm } from '../../components/account-form'
import { describeAccountError } from '../../lib/account-errors'
import { ACCOUNT_TYPE_LABELS } from '../../lib/account-types'
import { accountsQuery, apiSend } from '../../lib/client'
import { switchUser } from '../../lib/me'

export const Route = createFileRoute('/_authenticated/accounts')({
  loader: ({ context }) => context.queryClient.ensureQueryData(accountsQuery),
  component: AccountsPage,
})

function AccountsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: accounts } = useSuspenseQuery(accountsQuery)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: accountsQuery.queryKey })

  // Runs a change, then refetches the list. Errors are mapped onto the form or the page.
  async function change(run: () => Promise<unknown>, setError?: UseFormSetError<CreateAccountInput>): Promise<boolean> {
    setNotice(null)
    try {
      await run()
      setEditingId(null)
      return true
    } catch (error) {
      const outcome = describeAccountError(error)
      if ('signedOut' in outcome) {
        switchUser(queryClient, null)
        await navigate({ to: '/login', search: { redirect: '/accounts' } })
        return false
      }
      if ('notFound' in outcome) {
        setEditingId(null)
        setNotice(outcome.message)
      } else if (setError) {
        setError(outcome.field, { message: outcome.message })
      } else {
        setNotice(outcome.message)
      }
      return false
    } finally {
      await refresh()
    }
  }

  const create = (values: CreateAccountInput, setError: UseFormSetError<CreateAccountInput>) =>
    change(() => apiSend('POST', '/api/accounts', values, accountResponseSchema), setError)
  const update = (id: string) => (values: CreateAccountInput, setError: UseFormSetError<CreateAccountInput>) =>
    change(() => apiSend('PATCH', `/api/accounts/${id}`, values, accountResponseSchema), setError)
  const remove = (account: Account) => {
    if (window.confirm(`Delete "${account.name}"?`)) void change(() => apiSend('DELETE', `/api/accounts/${account.id}`))
  }

  return (
    <section className="mt-6 space-y-6 text-slate-700">
      <h2 className="text-xl font-semibold">Accounts</h2>
      <AccountForm submitLabel="Add account" onSubmit={create} />
      {notice && (
        <p role="status" className="text-sm text-amber-700">
          {notice}
        </p>
      )}
      {accounts.length === 0 ? (
        <p className="text-slate-500">No accounts yet. Add your first one above.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200">
          {accounts.map((account) => (
            <li key={account.id} className="p-3">
              {editingId === account.id ? (
                <AccountForm
                  defaultValues={{ name: account.name, type: account.type }}
                  submitLabel="Save"
                  onSubmit={update(account.id)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <span className="font-medium">{account.name}</span>
                  <span className="text-sm text-slate-500">{ACCOUNT_TYPE_LABELS[account.type]}</span>
                  <button type="button" onClick={() => setEditingId(account.id)} className="ml-auto text-emerald-700 underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => remove(account)} className="text-red-700 underline">
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
