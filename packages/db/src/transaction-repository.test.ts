import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals'
import { eq } from 'drizzle-orm'
import { AccountHasTransactionsError, createAccount, deleteAccount, getAccount, listAccounts } from './account-repository.js'
import { createDb } from './connection.js'
import { migrateDatabase } from './migrate.js'
import { accounts, transactions, users } from './schema.js'
import { getTestDatabaseUrl, resetTestDatabase } from './test-database.js'
import { createTransaction, deleteTransaction, listTransactions, updateTransaction } from './transaction-repository.js'
import { createUser } from './user-repository.js'

const { db, close } = createDb(getTestDatabaseUrl(process.env))

beforeAll(async () => {
  await resetTestDatabase(db)
  await migrateDatabase(db)
})
beforeEach(async () => {
  await db.delete(users) // must cascade through accounts and transactions (spec question T2)
})
afterAll(() => close())

const MAX = 99_999_999_999
const MISSING_ID = '00000000-0000-4000-8000-000000000000'
const constraintOf = (error: unknown) => (error as { cause?: { constraint?: string } }).cause?.constraint

async function userWithAccount(email: string, name = 'Wallet') {
  const user = await createUser(db, { email, passwordHash: 'not-used-here' })
  const account = await createAccount(db, { userId: user.id, name, type: 'cash' })
  return { user, account }
}
const add = (userId: string, accountId: string, amountCents: number, date = '2026-10-14', description = 'Groceries') =>
  createTransaction(db, { userId, accountId, amountCents, date, description })

describe('createTransaction', () => {
  test('stores the transaction and returns it, with the date as text', async () => {
    const { user, account } = await userWithAccount('ana@example.com')

    const transaction = await add(user.id, account.id, -25050)

    expect(transaction).toMatchObject({ userId: user.id, accountId: account.id, amountCents: -25050, date: '2026-10-14', description: 'Groceries' })
  })

  test("returns null for another user's account, and stores nothing", async () => {
    const ana = await userWithAccount('ana@example.com')
    const ben = await userWithAccount('ben@example.com')

    await expect(add(ben.user.id, ana.account.id, -100)).resolves.toBeNull()
    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  test('returns null for an account that does not exist', async () => {
    const { user } = await userWithAccount('ana@example.com')

    await expect(add(user.id, MISSING_ID, -100)).resolves.toBeNull()
  })
})

describe('the database itself', () => {
  test("refuses a raw insert pairing one user with another user's account", async () => {
    const ana = await userWithAccount('ana@example.com')
    const ben = await userWithAccount('ben@example.com')

    const error = await db
      .insert(transactions)
      .values({ userId: ben.user.id, accountId: ana.account.id, amountCents: -100, date: '2026-10-14', description: 'x' })
      .catch((e: unknown) => e)

    expect(constraintOf(error)).toBe('transactions_account_owned_fk')
  })

  test.each([
    ['zero', 0, 'transactions_amount_nonzero_within_limit'],
    ['over the limit', MAX + 1, 'transactions_amount_nonzero_within_limit'],
    ['under minus the limit', -MAX - 1, 'transactions_amount_nonzero_within_limit'],
  ])('refuses an amount of %s', async (_label, amountCents, constraint) => {
    const { user, account } = await userWithAccount('ana@example.com')

    expect(constraintOf(await add(user.id, account.id, amountCents).catch((e: unknown) => e))).toBe(constraint)
  })

  test.each([
    ['empty', ''],
    ['untrimmed', ' Rent '],
    ['101 characters', 'a'.repeat(101)],
  ])('refuses a description that is %s', async (_label, description) => {
    const { user, account } = await userWithAccount('ana@example.com')

    const error = await add(user.id, account.id, -100, '2026-10-14', description).catch((e: unknown) => e)

    expect(constraintOf(error)).toBe('transactions_description_trimmed_1_to_100')
  })

  test('refuses an impossible date', async () => {
    const { user, account } = await userWithAccount('ana@example.com')

    await expect(add(user.id, account.id, -100, '2026-02-30')).rejects.toThrow()
  })
})

describe('listTransactions', () => {
  test('lists one account, newest date first, then newest created first', async () => {
    const { user, account } = await userWithAccount('ana@example.com')
    const other = await createAccount(db, { userId: user.id, name: 'Bank', type: 'checking' })
    await add(user.id, account.id, -100, '2026-10-01', 'old')
    await add(user.id, account.id, -200, '2026-10-14', 'new, first')
    await add(user.id, account.id, -300, '2026-10-14', 'new, second')
    await add(user.id, other.id, -400, '2026-10-20', 'other account')

    const list = await listTransactions(db, { userId: user.id, accountId: account.id })

    expect(list.map((t) => t.description)).toEqual(['new, second', 'new, first', 'old'])
  })

  test("returns nothing for another user's account", async () => {
    const ana = await userWithAccount('ana@example.com')
    const ben = await userWithAccount('ben@example.com')
    await add(ana.user.id, ana.account.id, -100)

    await expect(listTransactions(db, { userId: ben.user.id, accountId: ana.account.id })).resolves.toEqual([])
  })
})

describe('updateTransaction', () => {
  test('changes the amount, the date and the description', async () => {
    const { user, account } = await userWithAccount('ana@example.com')
    const t = await add(user.id, account.id, -100)

    const updated = await updateTransaction(db, { userId: user.id, id: t!.id, amountCents: 5000, date: '2026-10-01', description: 'Refund' })

    expect(updated).toMatchObject({ amountCents: 5000, date: '2026-10-01', description: 'Refund' })
  })

  test("returns null for another user's transaction and leaves it unchanged", async () => {
    const ana = await userWithAccount('ana@example.com')
    const ben = await userWithAccount('ben@example.com')
    const t = await add(ana.user.id, ana.account.id, -100)

    await expect(updateTransaction(db, { userId: ben.user.id, id: t!.id, amountCents: 1 })).resolves.toBeNull()
    expect((await db.select().from(transactions).where(eq(transactions.id, t!.id)))[0]).toEqual(t)
  })

  test('throws when there is nothing to change', async () => {
    const { user, account } = await userWithAccount('ana@example.com')
    const t = await add(user.id, account.id, -100)

    await expect(updateTransaction(db, { userId: user.id, id: t!.id })).rejects.toThrow('Nothing to update')
  })
})

describe('deleteTransaction', () => {
  test('deletes it and returns true', async () => {
    const { user, account } = await userWithAccount('ana@example.com')
    const t = await add(user.id, account.id, -100)

    await expect(deleteTransaction(db, { userId: user.id, id: t!.id })).resolves.toBe(true)
    expect(await db.select().from(transactions)).toHaveLength(0)
  })

  test("returns false for another user's transaction and keeps it", async () => {
    const ana = await userWithAccount('ana@example.com')
    const ben = await userWithAccount('ben@example.com')
    const t = await add(ana.user.id, ana.account.id, -100)

    await expect(deleteTransaction(db, { userId: ben.user.id, id: t!.id })).resolves.toBe(false)
    expect(await db.select().from(transactions)).toHaveLength(1)
  })
})

describe('balances', () => {
  test('are 0 without transactions, and the signed sum with them', async () => {
    const { user, account } = await userWithAccount('ana@example.com')
    const empty = await createAccount(db, { userId: user.id, name: 'Bank', type: 'checking' })
    await add(user.id, account.id, 150000)
    await add(user.id, account.id, -25050)

    const list = await listAccounts(db, user.id)

    expect(list.map((a) => [a.name, a.balanceCents])).toEqual([['Bank', 0], ['Wallet', 124950]])
    expect((await getAccount(db, { userId: user.id, id: account.id }))?.balanceCents).toBe(124950)
    expect((await getAccount(db, { userId: user.id, id: empty.id }))?.balanceCents).toBe(0)
  })

  test('stay exact beyond 32 bits, as numbers', async () => {
    const { user, account } = await userWithAccount('ana@example.com')
    await add(user.id, account.id, MAX)
    await add(user.id, account.id, MAX)

    const balance = (await getAccount(db, { userId: user.id, id: account.id }))?.balanceCents

    expect(balance).toBe(199_999_999_998)
  })

  test("never count another user's transactions", async () => {
    const ana = await userWithAccount('ana@example.com')
    const ben = await userWithAccount('ben@example.com')
    await add(ana.user.id, ana.account.id, 100)
    await add(ben.user.id, ben.account.id, 999)

    expect((await listAccounts(db, ana.user.id))[0]?.balanceCents).toBe(100)
  })
})

describe('getAccount', () => {
  test("returns null for another user's account, or a missing one", async () => {
    const ana = await userWithAccount('ana@example.com')
    const ben = await userWithAccount('ben@example.com')

    await expect(getAccount(db, { userId: ben.user.id, id: ana.account.id })).resolves.toBeNull()
    await expect(getAccount(db, { userId: ana.user.id, id: MISSING_ID })).resolves.toBeNull()
  })
})

describe('deleting', () => {
  test('an account with transactions is refused, and the account survives', async () => {
    const { user, account } = await userWithAccount('ana@example.com')
    await add(user.id, account.id, -100)

    await expect(deleteAccount(db, { userId: user.id, id: account.id })).rejects.toBeInstanceOf(AccountHasTransactionsError)
    expect(await db.select().from(accounts)).toHaveLength(1)
  })

  test('an account without transactions still works', async () => {
    const { user, account } = await userWithAccount('ana@example.com')

    await expect(deleteAccount(db, { userId: user.id, id: account.id })).resolves.toBe(true)
  })

  test('a user deletes their accounts and transactions with them', async () => {
    const { user, account } = await userWithAccount('ana@example.com')
    await add(user.id, account.id, -100)

    await db.delete(users).where(eq(users.id, user.id))

    expect(await db.select().from(accounts)).toHaveLength(0)
    expect(await db.select().from(transactions)).toHaveLength(0)
  })
})
