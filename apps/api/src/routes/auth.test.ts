import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals'
import { createDb, createSession, createUser, migrateDatabase, sessions, users } from '@lab/db'
import { getTestDatabaseUrl, resetTestDatabase } from '@lab/db/testing'
import { apiErrorSchema, authResponseSchema } from '@lab/schemas'
import { createApp } from '../app.js'
import { hashPassword } from '../lib/password.js'
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
    expect(setCookie).toMatch(/Path=\/(;|$)/)
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

  test('stores a session that lasts as long as the cookie says (7 days)', async () => {
    await register(credentials)

    const [row] = await db.select().from(sessions)
    const remaining = (row?.expiresAt.getTime() ?? 0) - Date.now()
    expect(Math.abs(remaining - 7 * 24 * HOUR)).toBeLessThan(10_000)
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

describe('POST /api/auth/login', () => {
  const password = 'correct horse battery'

  function login(body: unknown) {
    return fetch(`${running.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async function seedUser(email = 'ana@example.com') {
    return createUser(db, { email, passwordHash: await hashPassword(password, { cost: 4 }) })
  }

  function cookiePair(res: Response) {
    return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  }

  function me(cookie: string) {
    return fetch(`${running.baseUrl}/api/auth/me`, { headers: { Cookie: cookie } })
  }

  test('signs the user in: 200, the public user and an HttpOnly session cookie', async () => {
    await seedUser()

    const res = await login({ email: 'ana@example.com', password })

    expect(res.status).toBe(200)
    expect(authResponseSchema.parse(await res.json()).user.email).toBe('ana@example.com')
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/^sid=[^;]+;/)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    expect(setCookie).toMatch(/Max-Age=604800(;|$)/)
  })

  test('stores a session that lasts as long as the cookie says (7 days)', async () => {
    await seedUser()

    await login({ email: 'ana@example.com', password })

    const [row] = await db.select().from(sessions)
    const remaining = (row?.expiresAt.getTime() ?? 0) - Date.now()
    expect(Math.abs(remaining - 7 * 24 * HOUR)).toBeLessThan(10_000)
  })

  test('the cookie from login works for /me', async () => {
    await seedUser()

    const res = await login({ email: 'ana@example.com', password })

    expect((await me(cookiePair(res))).status).toBe(200)
  })

  test('creates a new session for every login, and the earlier ones keep working', async () => {
    await seedUser()

    const first = cookiePair(await login({ email: 'ana@example.com', password }))
    const second = cookiePair(await login({ email: 'ana@example.com', password }))

    expect(first).not.toBe(second)
    expect((await me(first)).status).toBe(200)
    expect((await me(second)).status).toBe(200)
  })

  test('accepts the email in a different case', async () => {
    await seedUser()

    const res = await login({ email: '  ANA@Example.com ', password })

    expect(res.status).toBe(200)
  })

  test('responds 401 invalid_credentials for a wrong password, and sets no cookie', async () => {
    await seedUser()

    const res = await login({ email: 'ana@example.com', password: 'not the right password' })

    expect(res.status).toBe(401)
    expect(apiErrorSchema.parse(await res.json())).toEqual({
      error: { code: 'invalid_credentials', message: 'Invalid email or password' },
    })
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  test('answers an unknown email with exactly the same response as a wrong password', async () => {
    await seedUser()

    const wrongPassword = await login({ email: 'ana@example.com', password: 'not the right password' })
    const unknownEmail = await login({ email: 'nobody@example.com', password: 'not the right password' })

    expect(unknownEmail.status).toBe(wrongPassword.status)
    expect(await unknownEmail.text()).toBe(await wrongPassword.text())
    expect(unknownEmail.headers.get('set-cookie')).toBeNull()
  })

  test.each([
    ['an invalid email', { email: 'not-an-email', password }],
    ['an empty password', { email: 'ana@example.com', password: '' }],
    ['a password longer than 72 bytes', { email: 'ana@example.com', password: 'a'.repeat(73) }],
    ['a missing password', { email: 'ana@example.com' }],
  ])('responds 400 for %s', async (_name, body) => {
    const res = await login(body)

    expect(res.status).toBe(400)
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('validation_error')
  })

  test('takes about as long for an unknown email as for a wrong password, so timing reveals nothing', async () => {
    // A realistic work factor makes the hashing cost visible next to ordinary request overhead.
    const cost = 10
    const timed = await startApp(createApp({ webOrigin: 'http://localhost:5173', db, passwordCost: cost }))
    await createUser(db, { email: 'ana@example.com', passwordHash: await hashPassword(password, { cost }) })
    const attempt = async (email: string) => {
      const startedAt = performance.now()
      const res = await fetch(`${timed.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'not the right password' }),
      })
      await res.text()
      return performance.now() - startedAt
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0

    await attempt('ana@example.com') // warm up
    const wrongPassword: number[] = []
    const unknownEmail: number[] = []
    for (let i = 0; i < 5; i++) {
      wrongPassword.push(await attempt('ana@example.com'))
      unknownEmail.push(await attempt('nobody@example.com'))
    }
    await timed.close()

    const ratio = median(unknownEmail) / median(wrongPassword)
    expect(ratio).toBeGreaterThan(0.5) // without the defense this is about 0.05
  })
})

describe('POST /api/auth/logout', () => {
  function logout(cookie?: string) {
    return fetch(`${running.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: cookie ? { Cookie: cookie } : {},
    })
  }

  function me(cookie: string) {
    return fetch(`${running.baseUrl}/api/auth/me`, { headers: { Cookie: cookie } })
  }

  async function signedInCookie(email = 'ana@example.com') {
    const user = await createUser(db, { email, passwordHash: 'not-used-here' })
    const { token } = await createSession(db, { userId: user.id, ttlMs: HOUR })
    return { user, cookie: `sid=${token}` }
  }

  test('responds 204 and ends the session on the server, so the cookie stops working', async () => {
    const { cookie } = await signedInCookie()
    expect((await me(cookie)).status).toBe(200)

    const res = await logout(cookie)

    expect(res.status).toBe(204)
    expect((await me(cookie)).status).toBe(401)
  })

  test('clears the session cookie in the browser', async () => {
    const { cookie } = await signedInCookie()

    const res = await logout(cookie)

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/^sid=;/)
    expect(setCookie).toContain('Max-Age=0')
    expect(setCookie).toMatch(/Path=\/(;|$)/)
    expect(setCookie).toContain('HttpOnly')
  })

  test('keeps the Secure flag on the cleared cookie when secureCookies is on', async () => {
    const secure = await startApp(
      createApp({ webOrigin: 'http://localhost:5173', db, passwordCost: 4, secureCookies: true }),
    )

    const res = await fetch(`${secure.baseUrl}/api/auth/logout`, { method: 'POST' })

    await secure.close()
    expect(res.headers.get('set-cookie')).toContain('Secure')
  })

  test('ends only that session: the same user stays signed in on another device', async () => {
    const { user, cookie } = await signedInCookie()
    const other = await createSession(db, { userId: user.id, ttlMs: HOUR })

    await logout(cookie)

    expect((await me(`sid=${other.token}`)).status).toBe(200)
  })

  test('responds 204 and still clears the cookie when there is no session', async () => {
    const res = await logout()

    expect(res.status).toBe(204)
    expect(res.headers.get('set-cookie') ?? '').toContain('Max-Age=0')
  })

  test('responds 204 when the session token is unknown', async () => {
    const res = await logout('sid=not-a-real-token')

    expect(res.status).toBe(204)
  })

  test('deletes the session row from the database', async () => {
    const { cookie } = await signedInCookie()

    await logout(cookie)

    expect(await db.select().from(sessions)).toHaveLength(0)
  })
})
