import { describe, expect, test } from '@jest/globals'
import { MAX_AMOUNT_CENTS } from './money.js'
import { createTransactionInputSchema, transactionSchema, updateTransactionInputSchema } from './transactions.js'

const valid = { amountCents: -25050, date: '2026-10-14', description: 'Groceries' }

function messages(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  const byField: Record<string, string> = {}
  for (const issue of result.error?.issues ?? []) byField[String(issue.path[0] ?? '')] ??= issue.message
  return byField
}

describe('createTransactionInputSchema', () => {
  test('accepts an expense and an income, trimming the description', () => {
    expect(createTransactionInputSchema.parse({ ...valid, description: '  Groceries ' })).toEqual(valid)
    expect(createTransactionInputSchema.parse({ ...valid, amountCents: 150000 }).amountCents).toBe(150000)
  })

  test.each([
    ['zero', 0],
    ['a fraction of a cent', 10.5],
    ['more than the limit', MAX_AMOUNT_CENTS + 1],
    ['less than minus the limit', -MAX_AMOUNT_CENTS - 1],
  ])('refuses an amount of %s', (_label, amountCents) => {
    expect(createTransactionInputSchema.safeParse({ ...valid, amountCents }).success).toBe(false)
  })

  test('accepts exactly the limit, either way', () => {
    expect(createTransactionInputSchema.safeParse({ ...valid, amountCents: MAX_AMOUNT_CENTS }).success).toBe(true)
    expect(createTransactionInputSchema.safeParse({ ...valid, amountCents: -MAX_AMOUNT_CENTS }).success).toBe(true)
  })

  test.each(['2024-02-29', '1900-01-01', '2100-12-31', '2026-10-14'])('accepts the real date %p', (date) => {
    expect(createTransactionInputSchema.safeParse({ ...valid, date }).success).toBe(true)
  })

  test.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '1899-12-31', '2101-01-01', '0001-01-01', '14/10/2026', '2026-10-14T00:00:00Z', ''])(
    'refuses %p with "Enter a real date"',
    (date) => {
      expect(messages(createTransactionInputSchema.safeParse({ ...valid, date }))).toEqual({ date: 'Enter a real date' })
    },
  )

  test.each([
    ['an empty description', '', 'Enter a description'],
    ['only spaces', '   ', 'Enter a description'],
    ['101 characters', 'a'.repeat(101), 'Description must be at most 100 characters'],
  ])('refuses %s', (_label, description, message) => {
    expect(messages(createTransactionInputSchema.safeParse({ ...valid, description }))).toEqual({ description: message })
  })
})

describe('updateTransactionInputSchema', () => {
  test('accepts any one field', () => {
    expect(updateTransactionInputSchema.parse({ amountCents: 100 })).toEqual({ amountCents: 100 })
    expect(updateTransactionInputSchema.parse({ date: '2026-10-01' })).toEqual({ date: '2026-10-01' })
    expect(updateTransactionInputSchema.parse({ description: ' Rent ' })).toEqual({ description: 'Rent' })
  })

  test('refuses an empty change', () => {
    expect(updateTransactionInputSchema.safeParse({}).success).toBe(false)
  })
})

describe('transactionSchema', () => {
  const transaction = { id: '3f2b8c1e-5d6a-4b7c-9e0f-1a2b3c4d5e6f', accountId: '7f3c2a8e-1b4d-4c6a-9e2f-0a1b2c3d4e5f', ...valid, createdAt: '2026-10-14T01:00:00.000Z' }

  test('accepts the public shape', () => {
    expect(transactionSchema.parse(transaction)).toEqual(transaction)
  })

  test('refuses a transaction that carries userId', () => {
    expect(transactionSchema.safeParse({ ...transaction, userId: transaction.id }).success).toBe(false)
  })
})
