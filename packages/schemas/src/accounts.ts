import { z } from 'zod'

export const ACCOUNT_TYPES = ['checking', 'savings', 'cash', 'credit_card'] as const

export const accountTypeSchema = z.enum(ACCOUNT_TYPES, { error: 'Choose an account type' })

// Trimmed first, so a name of only spaces counts as empty.
const name = z
  .string()
  .trim()
  .min(1, 'Enter a name for the account')
  .max(50, 'Name must be at most 50 characters')

export const createAccountInputSchema = z.object({ name, type: accountTypeSchema })

export const updateAccountInputSchema = z
  .object({ name: name.optional(), type: accountTypeSchema.optional() })
  .refine((change) => change.name !== undefined || change.type !== undefined, 'Change the name or the type')

// strict: an account carrying extra fields (such as userId) is rejected, not silently trimmed.
export const accountSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  type: accountTypeSchema,
  createdAt: z.iso.datetime(),
  balanceCents: z.number().int(),
})

export const accountResponseSchema = z.object({ account: accountSchema })
export const accountsResponseSchema = z.object({ accounts: z.array(accountSchema) })

export type AccountType = z.infer<typeof accountTypeSchema>
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>
export type Account = z.infer<typeof accountSchema>
export type AccountResponse = z.infer<typeof accountResponseSchema>
export type AccountsResponse = z.infer<typeof accountsResponseSchema>
