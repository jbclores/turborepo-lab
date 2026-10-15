import { describe, expect, test } from '@jest/globals'
import { todayLocal, toFormValues, toTransactionInput, transactionFormSchema } from './transaction-form.js'

// These run in Asia/Manila (UTC+8, no daylight saving): apps/web/jest.config.js sets TZ for the workers.
describe('todayLocal', () => {
  test('is the local calendar date, not the UTC one', () => {
    const lateUtc = new Date('2026-10-13T23:30:00Z') // 07:30 on the 14th in Manila

    expect(lateUtc.toISOString().slice(0, 10)).toBe('2026-10-13') // the trap
    expect(todayLocal(lateUtc)).toBe('2026-10-14')
  })

  test('pads month and day', () => {
    expect(todayLocal(new Date('2026-01-04T01:00:00Z'))).toBe('2026-01-04')
  })
})

describe('toTransactionInput', () => {
  const base = { amount: '250.50', date: '2026-10-14', description: 'Groceries' }

  test('an expense becomes negative cents', () => {
    expect(toTransactionInput({ ...base, kind: 'expense' })).toEqual({ amountCents: -25050, date: '2026-10-14', description: 'Groceries' })
  })

  test('an income stays positive, with commas', () => {
    expect(toTransactionInput({ ...base, kind: 'income', amount: '1,500' }).amountCents).toBe(150000)
  })
})

describe('toFormValues', () => {
  const t = { id: 'x', accountId: 'y', date: '2026-10-14', description: 'Groceries', createdAt: '' }

  test('an expense prefills as Expense with a positive amount', () => {
    expect(toFormValues({ ...t, amountCents: -25050 })).toEqual({ kind: 'expense', amount: '250.50', date: '2026-10-14', description: 'Groceries' })
  })

  test('an income prefills as Income', () => {
    expect(toFormValues({ ...t, amountCents: 150000 }).kind).toBe('income')
  })

  test('switching an expense to income flips the sign', () => {
    expect(toTransactionInput({ ...toFormValues({ ...t, amountCents: -25050 }), kind: 'income' }).amountCents).toBe(25050)
  })
})

describe('transactionFormSchema', () => {
  test('puts the amount message on the amount field', () => {
    const result = transactionFormSchema.safeParse({ kind: 'expense', amount: '250.505', date: '2026-10-14', description: 'x' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({ path: ['amount'], message: 'Use at most 2 decimal places' })
  })
})
