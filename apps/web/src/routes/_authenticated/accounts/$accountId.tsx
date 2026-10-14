import { formatCents, transactionResponseSchema, type Transaction } from '@lab/schemas'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { UseFormSetError } from 'react-hook-form'
import { TransactionForm } from '../../../components/transaction-form'
import { describeTransactionError } from '../../../lib/account-errors'
import { ACCOUNT_TYPE_LABELS } from '../../../lib/account-types'
import { accountQuery, apiSend, transactionsQuery } from '../../../lib/client'
import { loadOrRedirect } from '../../../lib/route-load'
import { toFormValues, toTransactionInput, type TransactionFormValues } from '../../../lib/transaction-form'
import { useChange } from '../../../lib/use-change'

export const Route = createFileRoute('/_authenticated/accounts/$accountId')({
  loader: ({ context, params, location }) =>
    loadOrRedirect(context.queryClient, location.href, () =>
      Promise.all([
        context.queryClient.ensureQueryData(accountQuery(params.accountId)),
        context.queryClient.ensureQueryData(transactionsQuery(params.accountId)),
      ]),
    ),
  // Someone else's account, a deleted one, or a made-up id: the API answers 404 for all of them.
  notFoundComponent: () => (
    <section className="mt-6 space-y-3 text-slate-700">
      <p role="alert">This account doesn't exist.</p>
      <Link to="/accounts" className="text-emerald-700 underline">
        Back to accounts
      </Link>
    </section>
  ),
  component: AccountPage,
})

const signed = (cents: number) => `${cents < 0 ? 'text-red-700' : 'text-emerald-700'} tabular-nums`

function AccountPage() {
  const { accountId } = Route.useParams()
  const { data: account } = useSuspenseQuery(accountQuery(accountId))
  const { data: transactions } = useSuspenseQuery(transactionsQuery(accountId))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { change, notice } = useChange<TransactionFormValues>(describeTransactionError)

  const create = (values: TransactionFormValues, setError: UseFormSetError<TransactionFormValues>) =>
    change(() => apiSend('POST', `/api/accounts/${accountId}/transactions`, toTransactionInput(values), transactionResponseSchema), { setError })
  const update = (id: string) => (values: TransactionFormValues, setError: UseFormSetError<TransactionFormValues>) =>
    change(() => apiSend('PATCH', `/api/transactions/${id}`, toTransactionInput(values), transactionResponseSchema), {
      setError,
      done: () => setEditingId(null),
    })
  const remove = async (transaction: Transaction) => {
    if (!window.confirm(`Delete "${transaction.description}"?`)) return
    setDeletingId(transaction.id)
    await change(() => apiSend('DELETE', `/api/transactions/${transaction.id}`), {
      done: () => setEditingId((current) => (current === transaction.id ? null : current)),
    })
    setDeletingId(null)
  }

  return (
    <section className="mt-6 space-y-6 text-slate-700">
      <Link to="/accounts" className="text-sm text-emerald-700 underline">
        ← Accounts
      </Link>
      <header className="flex items-baseline gap-3">
        <h2 className="text-xl font-semibold">{account.name}</h2>
        <span className="text-sm text-slate-500">{ACCOUNT_TYPE_LABELS[account.type]}</span>
        <span className={`ml-auto text-xl font-semibold ${account.balanceCents < 0 ? 'text-red-700' : ''}`}>
          {formatCents(account.balanceCents)}
        </span>
      </header>
      <TransactionForm submitLabel="Add" onSubmit={create} />
      {notice && (
        <p role="status" className="text-sm text-amber-700">
          {notice}
        </p>
      )}
      {transactions.length === 0 ? (
        <p className="text-slate-500">No transactions yet. Add the first one above.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200">
          {transactions.map((t) => (
            <li key={t.id} className="p-3">
              {editingId === t.id ? (
                <TransactionForm defaultValues={toFormValues(t)} submitLabel="Save" onSubmit={update(t.id)} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500 tabular-nums">{t.date}</span>
                  <span>{t.description}</span>
                  <span className={`ml-auto ${signed(t.amountCents)}`}>{formatCents(t.amountCents)}</span>
                  <button type="button" onClick={() => setEditingId(t.id)} className="text-emerald-700 underline">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(t)}
                    disabled={deletingId === t.id}
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
