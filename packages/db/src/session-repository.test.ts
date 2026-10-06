import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals'
import { createHash } from 'node:crypto'
import { createDb } from './connection.js'
import { migrateDatabase } from './migrate.js'
import { sessions, users } from './schema.js'
import { createSession, deleteSession, getSessionUser } from './session-repository.js'
import { getTestDatabaseUrl, resetTestDatabase } from './test-database.js'
import { createUser } from './user-repository.js'

const { db, close } = createDb(getTestDatabaseUrl(process.env))
const HOUR = 60 * 60 * 1000
const now = new Date('2026-10-06T10:00:00.000Z')

beforeAll(async () => {
  await resetTestDatabase(db)
  await migrateDatabase(db)
})
beforeEach(async () => {
  await db.delete(users)
})
afterAll(() => close())

async function newUser(email = 'ana@example.com') {
  return createUser(db, { email, passwordHash: 'hash-1' })
}

describe('createSession', () => {
  test('returns a token and an expiry that is the given lifetime after now', async () => {
    const user = await newUser()

    const session = await createSession(db, { userId: user.id, ttlMs: 2 * HOUR, now })

    expect(session.token.length).toBeGreaterThanOrEqual(40)
    expect(session.expiresAt).toEqual(new Date(now.getTime() + 2 * HOUR))
  })

  test('stores only a hash of the token, never the token itself', async () => {
    const user = await newUser()

    const { token } = await createSession(db, { userId: user.id, ttlMs: HOUR, now })

    const [row] = await db.select().from(sessions)
    expect(row?.tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(row?.tokenHash).not.toBe(token)
  })

  test('gives every session a different token', async () => {
    const user = await newUser()

    const first = await createSession(db, { userId: user.id, ttlMs: HOUR, now })
    const second = await createSession(db, { userId: user.id, ttlMs: HOUR, now })

    expect(first.token).not.toBe(second.token)
  })
})

describe('getSessionUser', () => {
  test('returns the user a valid token belongs to, without the password hash', async () => {
    const user = await newUser()
    const { token } = await createSession(db, { userId: user.id, ttlMs: HOUR, now })

    const found = await getSessionUser(db, token, now)

    expect(found).toEqual({ id: user.id, email: user.email, createdAt: user.createdAt })
    expect(found).not.toHaveProperty('passwordHash')
  })

  test('returns null for a token that does not exist', async () => {
    await newUser()

    await expect(getSessionUser(db, 'not-a-real-token', now)).resolves.toBeNull()
  })

  test('returns null once the session has expired', async () => {
    const user = await newUser()
    const { token } = await createSession(db, { userId: user.id, ttlMs: HOUR, now })

    const later = new Date(now.getTime() + HOUR + 1)

    await expect(getSessionUser(db, token, later)).resolves.toBeNull()
  })

  test('treats the exact expiry moment as expired', async () => {
    const user = await newUser()
    const { token, expiresAt } = await createSession(db, { userId: user.id, ttlMs: HOUR, now })

    await expect(getSessionUser(db, token, expiresAt)).resolves.toBeNull()
  })

  test('returns the right user when several users have sessions', async () => {
    const ana = await newUser('ana@example.com')
    const bruno = await newUser('bruno@example.com')
    await createSession(db, { userId: ana.id, ttlMs: HOUR, now })
    const brunoSession = await createSession(db, { userId: bruno.id, ttlMs: HOUR, now })

    const found = await getSessionUser(db, brunoSession.token, now)

    expect(found?.email).toBe('bruno@example.com')
  })
})

describe('deleteSession', () => {
  test('makes the token stop working', async () => {
    const user = await newUser()
    const { token } = await createSession(db, { userId: user.id, ttlMs: HOUR, now })

    await deleteSession(db, token)

    await expect(getSessionUser(db, token, now)).resolves.toBeNull()
  })

  test('leaves other sessions working', async () => {
    const user = await newUser()
    const first = await createSession(db, { userId: user.id, ttlMs: HOUR, now })
    const second = await createSession(db, { userId: user.id, ttlMs: HOUR, now })

    await deleteSession(db, first.token)

    await expect(getSessionUser(db, second.token, now)).resolves.not.toBeNull()
  })
})

describe('sessions and users', () => {
  test('deleting a user also deletes their sessions', async () => {
    const user = await newUser()
    await createSession(db, { userId: user.id, ttlMs: HOUR, now })

    await db.delete(users)

    expect(await db.select().from(sessions)).toHaveLength(0)
  })
})
