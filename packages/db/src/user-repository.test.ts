import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals'
import { createDb } from './connection.js'
import { migrateDatabase } from './migrate.js'
import { users } from './schema.js'
import { getTestDatabaseUrl, resetTestDatabase } from './test-database.js'
import { createUser, EmailTakenError, findUserByEmail } from './user-repository.js'

const { db, close } = createDb(getTestDatabaseUrl(process.env))

beforeAll(async () => {
  await resetTestDatabase(db)
  await migrateDatabase(db)
})
beforeEach(async () => {
  await db.delete(users)
})
afterAll(() => close())

describe('createUser', () => {
  test('stores the user and returns it with a generated id and creation time', async () => {
    const user = await createUser(db, { email: 'ana@example.com', passwordHash: 'hash-1' })

    expect(user.email).toBe('ana@example.com')
    expect(user.passwordHash).toBe('hash-1')
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(Number.isNaN(user.createdAt.getTime())).toBe(false)
  })

  test('throws EmailTakenError when the email is already registered', async () => {
    await createUser(db, { email: 'ana@example.com', passwordHash: 'hash-1' })

    await expect(createUser(db, { email: 'ana@example.com', passwordHash: 'hash-2' })).rejects.toBeInstanceOf(
      EmailTakenError,
    )
  })

  test('does not store a second user when the email is taken', async () => {
    await createUser(db, { email: 'ana@example.com', passwordHash: 'hash-1' })
    await createUser(db, { email: 'ana@example.com', passwordHash: 'hash-2' }).catch(() => undefined)

    expect(await db.select().from(users)).toHaveLength(1)
  })
})

describe('findUserByEmail', () => {
  test('returns the user with that email', async () => {
    const created = await createUser(db, { email: 'ana@example.com', passwordHash: 'hash-1' })

    await expect(findUserByEmail(db, 'ana@example.com')).resolves.toEqual(created)
  })

  test('returns the matching user when several users exist', async () => {
    await createUser(db, { email: 'ana@example.com', passwordHash: 'hash-1' })
    const bruno = await createUser(db, { email: 'bruno@example.com', passwordHash: 'hash-2' })

    await expect(findUserByEmail(db, 'bruno@example.com')).resolves.toEqual(bruno)
  })

  test('returns null when no user has that email', async () => {
    await createUser(db, { email: 'ana@example.com', passwordHash: 'hash-1' })

    await expect(findUserByEmail(db, 'nobody@example.com')).resolves.toBeNull()
  })
})
