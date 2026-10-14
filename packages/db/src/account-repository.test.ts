import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals'
import {
  AccountNameTakenError,
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
} from './account-repository.js'
import { createDb } from './connection.js'
import { migrateDatabase } from './migrate.js'
import { accounts, users } from './schema.js'
import { getTestDatabaseUrl, resetTestDatabase } from './test-database.js'
import { createUser } from './user-repository.js'
import { eq } from 'drizzle-orm'

const { db, close } = createDb(getTestDatabaseUrl(process.env))

beforeAll(async () => {
  await resetTestDatabase(db)
  await migrateDatabase(db)
})
beforeEach(async () => {
  await db.delete(users) // cascades to accounts
})
afterAll(() => close())

const newUser = (email: string) => createUser(db, { email, passwordHash: 'not-used-here' })
const readRow = async (id: string) => (await db.select().from(accounts).where(eq(accounts.id, id)))[0]

describe('createAccount', () => {
  test('stores the account for that user and returns it', async () => {
    const ana = await newUser('ana@example.com')

    const account = await createAccount(db, { userId: ana.id, name: 'Wallet', type: 'cash' })

    expect(account).toMatchObject({ userId: ana.id, name: 'Wallet', type: 'cash' })
    expect(account.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await readRow(account.id)).toEqual(account)
  })

  test.each([
    ['the same case', 'Savings'],
    ['a different case', 'SAVINGS'],
  ])('refuses a duplicate name for the same user in %s', async (_label, second) => {
    const ana = await newUser('ana@example.com')
    await createAccount(db, { userId: ana.id, name: 'Savings', type: 'savings' })

    await expect(createAccount(db, { userId: ana.id, name: second, type: 'cash' })).rejects.toBeInstanceOf(
      AccountNameTakenError,
    )
    expect(await listAccounts(db, ana.id)).toHaveLength(1)
  })

  test('treats names that differ only by non-ASCII case as duplicates', async () => {
    const ana = await newUser('ana@example.com')
    await createAccount(db, { userId: ana.id, name: 'Épargne', type: 'savings' })

    await expect(createAccount(db, { userId: ana.id, name: 'épargne', type: 'savings' })).rejects.toBeInstanceOf(
      AccountNameTakenError,
    )
  })

  test('lets two users use the same name', async () => {
    const ana = await newUser('ana@example.com')
    const ben = await newUser('ben@example.com')
    await createAccount(db, { userId: ana.id, name: 'Wallet', type: 'cash' })

    await expect(createAccount(db, { userId: ben.id, name: 'Wallet', type: 'cash' })).resolves.toMatchObject({
      userId: ben.id,
    })
  })
})

describe('listAccounts', () => {
  test("returns only that user's accounts, sorted by name ignoring case", async () => {
    const ana = await newUser('ana@example.com')
    const ben = await newUser('ben@example.com')
    // Byte order would put every capital first (Cash, Zebra, bank); this database sorts by byte.
    await createAccount(db, { userId: ana.id, name: 'bank', type: 'checking' })
    await createAccount(db, { userId: ana.id, name: 'Zebra', type: 'savings' })
    await createAccount(db, { userId: ana.id, name: 'Cash', type: 'cash' })
    await createAccount(db, { userId: ben.id, name: 'Ben only', type: 'cash' })

    expect((await listAccounts(db, ana.id)).map((a) => a.name)).toEqual(['bank', 'Cash', 'Zebra'])
  })

  test('returns an empty list for a user with no accounts', async () => {
    const ana = await newUser('ana@example.com')

    await expect(listAccounts(db, ana.id)).resolves.toEqual([])
  })
})

describe('updateAccount', () => {
  test('changes the name, the type, or both', async () => {
    const ana = await newUser('ana@example.com')
    const account = await createAccount(db, { userId: ana.id, name: 'Wallet', type: 'cash' })

    expect(await updateAccount(db, { userId: ana.id, id: account.id, name: 'Purse' })).toMatchObject({
      name: 'Purse',
      type: 'cash',
    })
    expect(await updateAccount(db, { userId: ana.id, id: account.id, type: 'savings' })).toMatchObject({
      name: 'Purse',
      type: 'savings',
    })
    expect(await updateAccount(db, { userId: ana.id, id: account.id, name: 'Jar', type: 'cash' })).toMatchObject({
      name: 'Jar',
      type: 'cash',
    })
  })

  test('allows renaming an account to its own name in a different case', async () => {
    const ana = await newUser('ana@example.com')
    const account = await createAccount(db, { userId: ana.id, name: 'savings', type: 'savings' })

    await expect(updateAccount(db, { userId: ana.id, id: account.id, name: 'Savings' })).resolves.toMatchObject({
      name: 'Savings',
    })
  })

  test("refuses to rename onto another of the user's account names", async () => {
    const ana = await newUser('ana@example.com')
    await createAccount(db, { userId: ana.id, name: 'Savings', type: 'savings' })
    const wallet = await createAccount(db, { userId: ana.id, name: 'Wallet', type: 'cash' })

    await expect(updateAccount(db, { userId: ana.id, id: wallet.id, name: 'savings' })).rejects.toBeInstanceOf(
      AccountNameTakenError,
    )
  })

  test("returns null for another user's account and leaves it unchanged", async () => {
    const ana = await newUser('ana@example.com')
    const ben = await newUser('ben@example.com')
    const account = await createAccount(db, { userId: ana.id, name: 'Wallet', type: 'cash' })

    await expect(updateAccount(db, { userId: ben.id, id: account.id, name: 'Stolen' })).resolves.toBeNull()
    expect(await readRow(account.id)).toEqual(account)
  })

  test('returns null for an id that does not exist', async () => {
    const ana = await newUser('ana@example.com')

    await expect(
      updateAccount(db, { userId: ana.id, id: '00000000-0000-4000-8000-000000000000', name: 'X' }),
    ).resolves.toBeNull()
  })

  test('throws when there is nothing to change', async () => {
    const ana = await newUser('ana@example.com')
    const account = await createAccount(db, { userId: ana.id, name: 'Wallet', type: 'cash' })

    await expect(updateAccount(db, { userId: ana.id, id: account.id })).rejects.toThrow('Nothing to update')
  })
})

describe('deleteAccount', () => {
  test('deletes the account and returns true', async () => {
    const ana = await newUser('ana@example.com')
    const account = await createAccount(db, { userId: ana.id, name: 'Wallet', type: 'cash' })

    await expect(deleteAccount(db, { userId: ana.id, id: account.id })).resolves.toBe(true)
    expect(await readRow(account.id)).toBeUndefined()
  })

  test("returns false for another user's account and keeps it", async () => {
    const ana = await newUser('ana@example.com')
    const ben = await newUser('ben@example.com')
    const account = await createAccount(db, { userId: ana.id, name: 'Wallet', type: 'cash' })

    await expect(deleteAccount(db, { userId: ben.id, id: account.id })).resolves.toBe(false)
    expect(await readRow(account.id)).toEqual(account)
  })

  test('returns false for an id that does not exist', async () => {
    const ana = await newUser('ana@example.com')

    await expect(deleteAccount(db, { userId: ana.id, id: '00000000-0000-4000-8000-000000000000' })).resolves.toBe(
      false,
    )
  })
})

test("deleting a user deletes that user's accounts", async () => {
  const ana = await newUser('ana@example.com')
  await createAccount(db, { userId: ana.id, name: 'Wallet', type: 'cash' })

  await db.delete(users).where(eq(users.id, ana.id))

  expect(await db.select().from(accounts)).toHaveLength(0)
})

// The API validates names, but the repository is exported (seed scripts, the transactions milestone),
// so the database refuses what the API would refuse, by name of the constraint.
describe('the database itself refuses names the API would refuse', () => {
  const constraintOf = (error: unknown) => (error as { cause?: { constraint?: string } }).cause?.constraint

  test.each([
    ['an empty name', ''],
    ['a name with spaces around it', '  Wallet '],
    ['a 51-character name', 'a'.repeat(51)],
  ])('on create: %s', async (_label, name) => {
    const ana = await newUser('ana@example.com')

    const error = await createAccount(db, { userId: ana.id, name, type: 'cash' }).catch((e: unknown) => e)

    expect(constraintOf(error)).toBe('accounts_name_trimmed_1_to_50')
  })

  test('on update: a name of only spaces', async () => {
    const ana = await newUser('ana@example.com')
    const account = await createAccount(db, { userId: ana.id, name: 'Wallet', type: 'cash' })

    const error = await updateAccount(db, { userId: ana.id, id: account.id, name: '   ' }).catch((e: unknown) => e)

    expect(constraintOf(error)).toBe('accounts_name_trimmed_1_to_50')
  })

  test('accepts a trimmed name of exactly 50 characters', async () => {
    const ana = await newUser('ana@example.com')

    await expect(createAccount(db, { userId: ana.id, name: 'a'.repeat(50), type: 'cash' })).resolves.toMatchObject({
      name: 'a'.repeat(50),
    })
  })
})
