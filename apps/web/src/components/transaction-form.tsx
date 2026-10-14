import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, type UseFormSetError } from 'react-hook-form'
import { todayLocal, transactionFormSchema, type TransactionFormValues } from '../lib/transaction-form'

type TransactionFormProps = {
  defaultValues?: TransactionFormValues
  submitLabel: string
  // Resolves true when saved; on failure it reports with setError and resolves false.
  onSubmit: (values: TransactionFormValues, setError: UseFormSetError<TransactionFormValues>) => Promise<boolean>
  onCancel?: () => void
}

export function TransactionForm({ defaultValues, submitLabel, onSubmit, onCancel }: TransactionFormProps) {
  const fresh = (): TransactionFormValues => ({ kind: 'expense', amount: '', date: todayLocal(), description: '' })
  const form = useForm<TransactionFormValues>({ resolver: zodResolver(transactionFormSchema), defaultValues: defaultValues ?? fresh() })
  const { errors, isSubmitting } = form.formState
  const field = 'rounded border border-slate-300 px-3 py-2'
  const error = (message?: string) => message && <span className="mt-1 block text-sm text-red-600">{message}</span>

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const saved = await onSubmit(values, form.setError)
        // The create form starts over (keeping today's date); the edit form is closed by the page.
        if (saved && !defaultValues) form.reset(fresh())
      })}
      className="flex flex-wrap items-start gap-2"
    >
      <fieldset className="flex gap-3 py-2">
        <legend className="sr-only">Kind</legend>
        <label className="flex items-center gap-1">
          <input type="radio" value="expense" {...form.register('kind')} /> Expense
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" value="income" {...form.register('kind')} /> Income
        </label>
      </fieldset>
      <label className="w-28">
        <span className="sr-only">Amount</span>
        <input inputMode="decimal" placeholder="250.50" {...form.register('amount')} aria-invalid={errors.amount ? true : undefined} className={`w-full ${field}`} />
        {error(errors.amount?.message)}
      </label>
      <label>
        <span className="sr-only">Date</span>
        <input type="date" {...form.register('date')} aria-invalid={errors.date ? true : undefined} className={field} />
        {error(errors.date?.message)}
      </label>
      <label className="min-w-40 flex-1">
        <span className="sr-only">Description</span>
        <input placeholder="Description" {...form.register('description')} aria-invalid={errors.description ? true : undefined} className={`w-full ${field}`} />
        {error(errors.description?.message)}
      </label>
      <button type="submit" disabled={isSubmitting} className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50">
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="px-2 py-2 text-slate-600 underline">
          Cancel
        </button>
      )}
      {errors.root && (
        <p role="alert" className="w-full text-sm text-red-600">
          {errors.root.message}
        </p>
      )}
    </form>
  )
}
