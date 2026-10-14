import { z } from 'zod'
import { MAX_AMOUNT_CENTS } from './money.js'

// A calendar day that exists, within 1900-2100. Date.UTC would read years 0-99 as 1900-1999, so the year
// range is checked first; then the parts must survive a round trip (2026-02-30 rolls over to March).
function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (year < 1900 || year > 2100) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const amountCents = z
  .number()
  .int()
  .refine((cents) => cents !== 0 && Math.abs(cents) <= MAX_AMOUNT_CENTS, 'The amount is zero or too large')
const date = z.string().refine(isRealDate, 'Enter a real date')
const description = z
  .string()
  .trim()
  .min(1, 'Enter a description')
  .max(100, 'Description must be at most 100 characters')

export const createTransactionInputSchema = z.object({ amountCents, date, description })

export const updateTransactionInputSchema = z
  .object({ amountCents: amountCents.optional(), date: date.optional(), description: description.optional() })
  .refine(
    (change) => change.amountCents !== undefined || change.date !== undefined || change.description !== undefined,
    'Change the amount, the date or the description',
  )

// strict: a transaction carrying extra fields (such as userId) is rejected, not silently trimmed.
export const transactionSchema = z.strictObject({
  id: z.uuid(),
  accountId: z.uuid(),
  amountCents: z.number().int(),
  date: z.string(),
  description: z.string(),
  createdAt: z.iso.datetime(),
})

export const transactionResponseSchema = z.object({ transaction: transactionSchema })
export const transactionsResponseSchema = z.object({ transactions: z.array(transactionSchema) })

export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>
export type UpdateTransactionInput = z.infer<typeof updateTransactionInputSchema>
export type Transaction = z.infer<typeof transactionSchema>
export type TransactionResponse = z.infer<typeof transactionResponseSchema>
export type TransactionsResponse = z.infer<typeof transactionsResponseSchema>
