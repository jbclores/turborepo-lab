import { zodResolver } from '@hookform/resolvers/zod'
import { ACCOUNT_TYPES, createAccountInputSchema, type CreateAccountInput } from '@lab/schemas'
import { useForm, type UseFormSetError } from 'react-hook-form'
import { ACCOUNT_TYPE_LABELS } from '../lib/account-types'

type AccountFormProps = {
  defaultValues?: CreateAccountInput
  submitLabel: string
  // Resolves true when saved; on failure it reports the error with setError and resolves false.
  onSubmit: (values: CreateAccountInput, setError: UseFormSetError<CreateAccountInput>) => Promise<boolean>
  onCancel?: () => void
}

export function AccountForm({ defaultValues, submitLabel, onSubmit, onCancel }: AccountFormProps) {
  const form = useForm<CreateAccountInput>({
    resolver: zodResolver(createAccountInputSchema),
    defaultValues: defaultValues ?? { name: '', type: '' as CreateAccountInput['type'] },
  })
  const { errors, isSubmitting } = form.formState

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const saved = await onSubmit(values, form.setError)
        // The create form empties itself after a save; the edit form is closed by the page instead.
        if (saved && !defaultValues) form.reset()
      })}
      className="flex flex-wrap items-start gap-2"
    >
      <label className="flex-1">
        <span className="sr-only">Name</span>
        <input
          placeholder="Account name"
          {...form.register('name')}
          aria-invalid={errors.name ? true : undefined}
          className="w-full rounded border border-slate-300 px-3 py-2"
        />
        {errors.name && <span className="mt-1 block text-sm text-red-600">{errors.name.message}</span>}
      </label>
      <label>
        <span className="sr-only">Type</span>
        <select {...form.register('type')} className="rounded border border-slate-300 px-3 py-2">
          <option value="">Type…</option>
          {ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACCOUNT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        {errors.type && <span className="mt-1 block text-sm text-red-600">{errors.type.message}</span>}
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
