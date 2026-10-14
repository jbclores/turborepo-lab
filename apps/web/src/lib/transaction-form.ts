import { centsToAmountText, createTransactionInputSchema, parseAmountToCents, type CreateTransactionInput, type Transaction } from '@lab/schemas'
import { z } from 'zod'

// The form's own shape: what a person types. toTransactionInput turns it into what the API takes.
export const transactionFormSchema = z.object({
  kind: z.enum(['expense', 'income']),
  amount: z.string().superRefine((value, ctx) => {
    const parsed = parseAmountToCents(value)
    if (!parsed.ok) ctx.addIssue({ code: 'custom', message: parsed.message })
  }),
  date: createTransactionInputSchema.shape.date,
  description: createTransactionInputSchema.shape.description,
})

export type TransactionFormValues = z.input<typeof transactionFormSchema>

export function toTransactionInput(values: TransactionFormValues): CreateTransactionInput {
  const parsed = parseAmountToCents(values.amount)
  if (!parsed.ok) throw new Error(parsed.message) // the form schema has already refused this
  return {
    amountCents: values.kind === 'expense' ? -parsed.cents : parsed.cents,
    date: values.date,
    description: values.description.trim(),
  }
}

export function toFormValues(transaction: Transaction): TransactionFormValues {
  return {
    kind: transaction.amountCents < 0 ? 'expense' : 'income',
    amount: centsToAmountText(transaction.amountCents),
    date: transaction.date,
    description: transaction.description,
  }
}

// Today's calendar date where the user is. Not toISOString(), which is UTC: before 8 am in Manila
// it is still yesterday there.
export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
