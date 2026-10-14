import type { Account, CreateAccountInput } from '@lab/schemas'
import { accountResponseSchema, formatCents } from '@lab/schemas'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { UseFormSetError } from 'react-hook-form'
import { AccountForm } from '../../../components/account-form'
import { describeAccountError } from '../../../lib/account-errors'
import { ACCOUNT_TYPE_LABELS } from '../../../lib/account-types'
import { accountsQuery, apiSend } from '../../../lib/client'
import { loadOrRedirect } from '../../../lib/route-load'
import { useChange } from '../../../lib/use-change'

export const Route = createFileRoute('/_authenticated/accounts/')({
  // The guard trusts the cached user, so a session that ended since then shows up here as a 401.
  loader: ({ context, location }) =>
    loadOrRedirect(context.queryClient, location.href, () => context.queryClient.ensureQueryData(accountsQuery)),
  component: AccountsPage,
})

function AccountsPage() {
  const { data: accounts } = useSuspenseQuery(accountsQuery)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { change, notice } = useChange<CreateAccountInput>(describeAccountError)

  const create = (values: CreateAccountInput, setError: UseFormSetError<CreateAccountInput>) =>
    change(() => apiSend('POST', '/api/accounts', values, accountResponseSchema), { setError })
  const update = (id: string) => (values: CreateAccountInput, setError: UseFormSetError<CreateAccountInput>) =>
    change(() => apiSend('PATCH', `/api/accounts/${id}`, values, accountResponseSchema), {
      setError,
      done: () => setEditingId(null),
    })
  const remove = async (account: Account) => {
    if (!window.confirm(`Delete "${account.name}"?`)) return
    setDeletingId(account.id)
    await change(() => apiSend('DELETE', `/api/accounts/${account.id}`), {
      done: () => setEditingId((current) => (current === account.id ? null : current)),
    })
    setDeletingId(null)
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
                  <Link to="/accounts/$accountId" params={{ accountId: account.id }} className="font-medium text-emerald-800 underline">
                    {account.name}
                  </Link>
                  <span className="text-sm text-slate-500">{ACCOUNT_TYPE_LABELS[account.type]}</span>
                  <span className={`ml-auto tabular-nums ${account.balanceCents < 0 ? 'text-red-700' : ''}`}>
                    {formatCents(account.balanceCents)}
                  </span>
                  <button type="button" onClick={() => setEditingId(account.id)} className="text-emerald-700 underline">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(account)}
                    disabled={deletingId === account.id}
                    className="text-red-700 underline disabled:opacity-50"
                  >
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
