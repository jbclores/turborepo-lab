import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals'
import { createDb, createSession, createUser, migrateDatabase, users } from '@lab/db'
import { getTestDatabaseUrl, resetTestDatabase } from '@lab/db/testing'
import { apiErrorSchema, authResponseSchema } from '@lab/schemas'
import { createApp } from '../app.js'
import { startApp, type RunningApp } from '../testing/start-app.js'

const testDatabase = createDb(getTestDatabaseUrl(process.env))
const db = testDatabase.db

const HOUR = 60 * 60 * 1000

let running: RunningApp

beforeAll(async () => {
  await resetTestDatabase(db)
  await migrateDatabase(db)
  running = await startApp(createApp({ webOrigin: 'http://localhost:5173', db }))
})

beforeEach(async () => {
  await db.delete(users)
})

afterAll(async () => {
  await running.close()
  await testDatabase.close()
})

describe('GET /api/auth/me', () => {
  test('responds 401 with the shared error when there is no session cookie', async () => {
    const res = await fetch(`${running.baseUrl}/api/auth/me`)

    expect(res.status).toBe(401)
    expect(apiErrorSchema.parse(await res.json())).toEqual({
      error: { code: 'unauthorized', message: 'Authentication required' },
    })
  })

  test('responds 200 with the public user when the session cookie is valid', async () => {
    const user = await createUser(db, { email: 'ana@example.com', passwordHash: 'not-used-here' })
    const { token } = await createSession(db, { userId: user.id, ttlMs: HOUR })

    const res = await fetch(`${running.baseUrl}/api/auth/me`, { headers: { Cookie: `sid=${token}` } })

    expect(res.status).toBe(200)
    expect(authResponseSchema.parse(await res.json())).toEqual({
      user: { id: user.id, email: 'ana@example.com', createdAt: user.createdAt.toISOString() },
    })
  })

  test('responds 401 when the session token is unknown', async () => {
    const res = await fetch(`${running.baseUrl}/api/auth/me`, { headers: { Cookie: 'sid=not-a-real-token' } })

    expect(res.status).toBe(401)
  })

  test('responds 401 when the session has expired', async () => {
    const user = await createUser(db, { email: 'ana@example.com', passwordHash: 'not-used-here' })
    const twoHoursAgo = new Date(Date.now() - 2 * HOUR)
    const { token } = await createSession(db, { userId: user.id, ttlMs: HOUR, now: twoHoursAgo })

    const res = await fetch(`${running.baseUrl}/api/auth/me`, { headers: { Cookie: `sid=${token}` } })

    expect(res.status).toBe(401)
  })

  test('finds the session cookie among other cookies', async () => {
    const user = await createUser(db, { email: 'ana@example.com', passwordHash: 'not-used-here' })
    const { token } = await createSession(db, { userId: user.id, ttlMs: HOUR })

    const res = await fetch(`${running.baseUrl}/api/auth/me`, {
      headers: { Cookie: `theme=dark; sid=${token}; lang=en` },
    })

    expect(res.status).toBe(200)
  })

  test('responds 401, not an error, when other cookies are sent but no session cookie', async () => {
    const res = await fetch(`${running.baseUrl}/api/auth/me`, { headers: { Cookie: 'theme=dark; lang=en' } })

    expect(res.status).toBe(401)
  })

  test('responds 401, not an error, for a malformed cookie header', async () => {
    const res = await fetch(`${running.baseUrl}/api/auth/me`, { headers: { Cookie: 'sid' } })

    expect(res.status).toBe(401)
  })
})
