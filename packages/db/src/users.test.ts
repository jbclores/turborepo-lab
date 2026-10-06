import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals'
import { eq } from 'drizzle-orm'
import { createDb } from './connection.js'
import { migrateDatabase } from './migrate.js'
import { users } from './schema.js'
import { getTestDatabaseUrl, resetTestDatabase } from './test-database.js'

const { db, close } = createDb(getTestDatabaseUrl(process.env))

beforeAll(async () => {
  await resetTestDatabase(db)
  await migrateDatabase(db)
})
beforeEach(async () => {
  await db.delete(users)
})
afterAll(() => close())

describe('users table', () => {
  test('stores a user and reads it back', async () => {
    const [created] = await db.insert(users).values({ email: 'ana@example.com' }).returning()
    const [found] = await db.select().from(users).where(eq(users.email, 'ana@example.com'))

    expect(found).toEqual(created)
    expect(found?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(Number.isNaN(found?.createdAt.getTime())).toBe(false)
  })

  test('rejects a user without an email', async () => {
    // The cast bypasses TypeScript on purpose: the database itself must refuse it.
    const withoutEmail = {} as { email: string }

    await expect(db.insert(users).values(withoutEmail)).rejects.toThrow()
  })

  test('rejects a second user with the same email', async () => {
    await db.insert(users).values({ email: 'ana@example.com' })

    await expect(db.insert(users).values({ email: 'ana@example.com' })).rejects.toThrow()
  })
})
