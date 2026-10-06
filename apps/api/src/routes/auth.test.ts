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
  running = await startApp(createApp({ webOrigin: 'http://localhost:5173', db, passwordCost: 4 }))
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

describe('POST /api/auth/register', () => {
  const credentials = { email: 'ana@example.com', password: 'correct horse battery' }

  function register(body: unknown) {
    return fetch(`${running.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  test('creates the user and responds 201 with the public user', async () => {
    const res = await register(credentials)

    expect(res.status).toBe(201)
    const { user } = authResponseSchema.parse(await res.json())
    expect(user.email).toBe('ana@example.com')
  })

  test('sets an HttpOnly, SameSite=Lax session cookie that lasts 7 days', async () => {
    const res = await register(credentials)

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/^sid=[^;]+;/)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toMatch(/Max-Age=604800(;|$)/) // exactly 7 days in seconds, not a prefix of a bigger number
    expect(setCookie).not.toContain('Secure')
  })

  test('the session cookie signs the new user in', async () => {
    const res = await register(credentials)
    const cookiePair = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''

    const me = await fetch(`${running.baseUrl}/api/auth/me`, { headers: { Cookie: cookiePair } })

    expect(me.status).toBe(200)
    expect(authResponseSchema.parse(await me.json()).user.email).toBe('ana@example.com')
  })

  test('stores a bcrypt hash and never the password', async () => {
    await register(credentials)

    const [row] = await db.select().from(users)
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/)
    expect(row?.passwordHash).not.toContain(credentials.password)
  })

  test('responds 409 with the shared error when the email is already registered', async () => {
    await register(credentials)

    const res = await register({ ...credentials, password: 'a different password' })

    expect(res.status).toBe(409)
    expect(apiErrorSchema.parse(await res.json())).toEqual({
      error: { code: 'email_taken', message: 'Email is already registered' },
    })
    expect(await db.select().from(users)).toHaveLength(1)
  })

  test('treats the same email in another case as already registered', async () => {
    await register(credentials)

    const res = await register({ ...credentials, email: '  ANA@Example.com ' })

    expect(res.status).toBe(409)
  })

  test.each([
    ['an invalid email', { email: 'not-an-email', password: 'correct horse battery' }],
    ['a password shorter than 12 characters', { email: 'ana@example.com', password: 'too short' }],
    ['a password longer than 72 bytes', { email: 'ana@example.com', password: 'a'.repeat(73) }],
    ['a missing password', { email: 'ana@example.com' }],
    ['a body that is not an object', 'just a string'],
  ])('responds 400 and creates no user for %s', async (_name, body) => {
    const res = await register(body)

    expect(res.status).toBe(400)
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('validation_error')
    expect(await db.select().from(users)).toHaveLength(0)
  })

  test('responds 400 with the shared error when the body is not valid JSON', async () => {
    const res = await fetch(`${running.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": ',
    })

    expect(res.status).toBe(400)
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('validation_error')
  })

  test('responds 400 when there is no JSON content type, so there is no body to read', async () => {
    const res = await fetch(`${running.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(credentials),
    })

    expect(res.status).toBe(400)
  })

  test('responds 500 with a generic error that leaks nothing when the database fails', async () => {
    const broken = createDb('postgres://lab:unused@127.0.0.1:1/lab_test', { connectionTimeoutMs: 300 })
    const logged: unknown[] = []
    const app = await startApp(
      createApp({
        webOrigin: 'http://localhost:5173',
        db: broken.db,
        passwordCost: 4,
        logError: (error) => logged.push(error),
      }),
    )

    const res = await fetch(`${app.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
    const text = await res.text()

    await app.close()
    await broken.close()
    expect(res.status).toBe(500)
    expect(apiErrorSchema.parse(JSON.parse(text))).toEqual({
      error: { code: 'internal_error', message: 'Something went wrong' },
    })
    expect(text).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|postgres|stack/i)
    expect(logged).toHaveLength(1) // the real error is kept on the server, for the operator
  })

  test('adds the Secure flag to the cookie when secureCookies is on', async () => {
    const secure = await startApp(
      createApp({ webOrigin: 'http://localhost:5173', db, passwordCost: 4, secureCookies: true }),
    )

    const res = await fetch(`${secure.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })

    await secure.close()
    expect(res.headers.get('set-cookie')).toContain('Secure')
  })
})
