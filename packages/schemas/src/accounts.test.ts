import { describe, expect, test } from '@jest/globals'
import {
  accountSchema,
  accountsResponseSchema,
  ACCOUNT_TYPES,
  createAccountInputSchema,
  updateAccountInputSchema,
} from './accounts.js'

// The first message for each field, the one the form shows ('' for errors on the whole object).
function messages(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  const byField: Record<string, string> = {}
  for (const issue of result.error?.issues ?? []) byField[String(issue.path[0] ?? '')] ??= issue.message
  return byField
}

describe('createAccountInputSchema', () => {
  test('accepts a name and each of the four types', () => {
    for (const type of ['checking', 'savings', 'cash', 'credit_card']) {
      expect(createAccountInputSchema.parse({ name: 'Wallet', type })).toEqual({ name: 'Wallet', type })
    }
    expect(ACCOUNT_TYPES).toEqual(['checking', 'savings', 'cash', 'credit_card'])
  })

  test('trims the name and keeps its case', () => {
    expect(createAccountInputSchema.parse({ name: '  BDO Savings ', type: 'savings' }).name).toBe('BDO Savings')
  })

  test.each([
    ['an empty name', '', 'Enter a name for the account'],
    ['a name of only spaces', '   ', 'Enter a name for the account'],
    ['a 51-character name', 'a'.repeat(51), 'Name must be at most 50 characters'],
  ])('refuses %s', (_label, name, message) => {
    expect(messages(createAccountInputSchema.safeParse({ name, type: 'cash' }))).toEqual({ name: message })
  })

  test('accepts a name of exactly 50 characters', () => {
    expect(createAccountInputSchema.safeParse({ name: 'a'.repeat(50), type: 'cash' }).success).toBe(true)
  })

  test.each([
    ['an unknown type', 'stocks'],
    ['an empty type (the select left on its placeholder)', ''],
    ['a missing type', undefined],
  ])('refuses %s with "Choose an account type"', (_label, type) => {
    expect(messages(createAccountInputSchema.safeParse({ name: 'Wallet', type }))).toEqual({
      type: 'Choose an account type',
    })
  })
})

describe('updateAccountInputSchema', () => {
  test('accepts only a name, only a type, or both', () => {
    expect(updateAccountInputSchema.parse({ name: ' New ' })).toEqual({ name: 'New' })
    expect(updateAccountInputSchema.parse({ type: 'cash' })).toEqual({ type: 'cash' })
    expect(updateAccountInputSchema.parse({ name: 'New', type: 'cash' })).toEqual({ name: 'New', type: 'cash' })
  })

  test('refuses an empty change', () => {
    expect(messages(updateAccountInputSchema.safeParse({}))).toEqual({ '': 'Change the name or the type' })
  })

  test('applies the same name rules as create', () => {
    expect(messages(updateAccountInputSchema.safeParse({ name: '   ' }))).toEqual({ name: 'Enter a name for the account' })
  })
})

describe('accountSchema', () => {
  const account = {
    id: '3f2b8c1e-5d6a-4b7c-9e0f-1a2b3c4d5e6f',
    name: 'Wallet',
    type: 'cash',
    createdAt: '2026-10-13T10:00:00.000Z',
    balanceCents: 0,
  }

  test('accepts the public shape', () => {
    expect(accountsResponseSchema.parse({ accounts: [account] })).toEqual({ accounts: [account] })
  })

  test('refuses an account that carries userId, so a leak fails loudly', () => {
    expect(accountSchema.safeParse({ ...account, userId: account.id }).success).toBe(false)
  })
})
