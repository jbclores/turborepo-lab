import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals'
import { accounts, accountType, createAccount, createDb, createSession, createUser, migrateDatabase, users } from '@lab/db'
import { getTestDatabaseUrl, resetTestDatabase } from '@lab/db/testing'
import { accountResponseSchema, accountsResponseSchema, ACCOUNT_TYPES, apiErrorSchema } from '@lab/schemas'
import { createApp } from '../app.js'
import { startApp, type RunningApp } from '../testing/start-app.js'

const testDatabase = createDb(getTestDatabaseUrl(process.env))
const db = testDatabase.db
const HOUR = 60 * 60 * 1000
const MISSING_ID = '00000000-0000-4000-8000-000000000000'

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

async function signIn(email: string) {
  const user = await createUser(db, { email, passwordHash: 'not-used-here' })
  const { token } = await createSession(db, { userId: user.id, ttlMs: HOUR })
  return { user, cookie: `sid=${token}` }
}

function call(method: string, path: string, init: { cookie?: string; body?: unknown; origin?: string } = {}) {
  const headers: Record<string, string> = {}
  if (init.cookie) headers.Cookie = init.cookie
  if (init.origin) headers.Origin = init.origin
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  return fetch(`${running.baseUrl}/api/accounts${path}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

// Filtered in JS: @lab/api does not depend on drizzle-orm, and these tables stay tiny in tests.
const rowOf = async (id: string) => (await db.select().from(accounts)).find((row) => row.id === id)

test('the database enum and the shared schema list the same account types', () => {
  expect(accountType.enumValues).toEqual([...ACCOUNT_TYPES])
})

describe('without a session', () => {
  test.each([
    ['GET', ''],
    ['POST', ''],
    ['PATCH', `/${MISSING_ID}`],
    ['DELETE', `/${MISSING_ID}`],
  ])('%s /api/accounts%s responds 401', async (method, path) => {
    const res = await call(method, path, { body: method === 'POST' || method === 'PATCH' ? { name: 'X' } : undefined })

    expect(res.status).toBe(401)
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('unauthorized')
  })
})

describe('GET /api/accounts', () => {
  test("lists only the signed-in user's accounts, sorted by name, without userId", async () => {
    const ana = await signIn('ana@example.com')
    const ben = await signIn('ben@example.com')
    await createAccount(db, { userId: ana.user.id, name: 'wallet', type: 'cash' })
    await createAccount(db, { userId: ana.user.id, name: 'BDO', type: 'checking' })
    await createAccount(db, { userId: ben.user.id, name: 'Ben only', type: 'cash' })

    const res = await call('GET', '', { cookie: ana.cookie })

    expect(res.status).toBe(200)
    const { accounts: list } = accountsResponseSchema.parse(await res.json()) // strict: fails on userId
    expect(list.map((a) => a.name)).toEqual(['BDO', 'wallet'])
  })
})

describe('POST /api/accounts', () => {
  test('responds 201 with the new account, trimmed', async () => {
    const ana = await signIn('ana@example.com')

    const res = await call('POST', '', { cookie: ana.cookie, body: { name: '  Wallet ', type: 'cash' } })

    expect(res.status).toBe(201)
    const { account } = accountResponseSchema.parse(await res.json())
    expect(account).toMatchObject({ name: 'Wallet', type: 'cash' })
    expect((await rowOf(account.id))?.userId).toBe(ana.user.id)
  })

  test.each([
    ['an empty name', { name: '', type: 'cash' }],
    ['a name of only spaces', { name: '   ', type: 'cash' }],
    ['a 51-character name', { name: 'a'.repeat(51), type: 'cash' }],
    ['an unknown type', { name: 'Wallet', type: 'stocks' }],
    ['no type', { name: 'Wallet' }],
  ])('responds 400 for %s and stores nothing', async (_label, body) => {
    const ana = await signIn('ana@example.com')

    const res = await call('POST', '', { cookie: ana.cookie, body })

    expect(res.status).toBe(400)
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('validation_error')
    expect(await db.select().from(accounts)).toHaveLength(0)
  })

  test('responds 409 for a name the user already has, in any case', async () => {
    const ana = await signIn('ana@example.com')
    await createAccount(db, { userId: ana.user.id, name: 'Savings', type: 'savings' })

    const res = await call('POST', '', { cookie: ana.cookie, body: { name: 'SAVINGS', type: 'cash' } })

    expect(res.status).toBe(409)
    expect(apiErrorSchema.parse(await res.json())).toEqual({
      error: { code: 'account_name_taken', message: 'An account with this name already exists' },
    })
  })

  test("allows a name another user already has", async () => {
    const ana = await signIn('ana@example.com')
    const ben = await signIn('ben@example.com')
    await createAccount(db, { userId: ana.user.id, name: 'Wallet', type: 'cash' })

    expect((await call('POST', '', { cookie: ben.cookie, body: { name: 'Wallet', type: 'cash' } })).status).toBe(201)
  })
})

describe('PATCH /api/accounts/:id', () => {
  test('renames and retypes, responding 200 with the account', async () => {
    const ana = await signIn('ana@example.com')
    const account = await createAccount(db, { userId: ana.user.id, name: 'Wallet', type: 'cash' })

    const res = await call('PATCH', `/${account.id}`, { cookie: ana.cookie, body: { name: 'Purse', type: 'savings' } })

    expect(res.status).toBe(200)
    expect(accountResponseSchema.parse(await res.json()).account).toMatchObject({ name: 'Purse', type: 'savings' })
  })

  test('allows renaming to its own name in a different case', async () => {
    const ana = await signIn('ana@example.com')
    const account = await createAccount(db, { userId: ana.user.id, name: 'savings', type: 'savings' })

    expect((await call('PATCH', `/${account.id}`, { cookie: ana.cookie, body: { name: 'Savings' } })).status).toBe(200)
  })

  test('responds 400 for an empty change', async () => {
    const ana = await signIn('ana@example.com')
    const account = await createAccount(db, { userId: ana.user.id, name: 'Wallet', type: 'cash' })

    expect((await call('PATCH', `/${account.id}`, { cookie: ana.cookie, body: {} })).status).toBe(400)
  })

  test("responds 404 for another user's account and leaves it unchanged", async () => {
    const ana = await signIn('ana@example.com')
    const ben = await signIn('ben@example.com')
    const account = await createAccount(db, { userId: ana.user.id, name: 'Wallet', type: 'cash' })

    const res = await call('PATCH', `/${account.id}`, { cookie: ben.cookie, body: { name: 'Stolen' } })

    expect(res.status).toBe(404)
    expect(apiErrorSchema.parse(await res.json())).toEqual({ error: { code: 'not_found', message: 'Account not found' } })
    expect(await rowOf(account.id)).toEqual(account)
  })

  test.each([
    ['an id that does not exist', MISSING_ID],
    ['an id that is not a UUID', 'abc'],
  ])('responds 404 for %s', async (_label, id) => {
    const ana = await signIn('ana@example.com')

    expect((await call('PATCH', `/${id}`, { cookie: ana.cookie, body: { name: 'X' } })).status).toBe(404)
  })

  test("responds 409 when renaming onto another of the user's names", async () => {
    const ana = await signIn('ana@example.com')
    await createAccount(db, { userId: ana.user.id, name: 'Savings', type: 'savings' })
    const wallet = await createAccount(db, { userId: ana.user.id, name: 'Wallet', type: 'cash' })

    expect((await call('PATCH', `/${wallet.id}`, { cookie: ana.cookie, body: { name: 'savings' } })).status).toBe(409)
  })
})

describe('DELETE /api/accounts/:id', () => {
  test('responds 204 and the account is gone', async () => {
    const ana = await signIn('ana@example.com')
    const account = await createAccount(db, { userId: ana.user.id, name: 'Wallet', type: 'cash' })

    expect((await call('DELETE', `/${account.id}`, { cookie: ana.cookie })).status).toBe(204)
    expect(await rowOf(account.id)).toBeUndefined()
  })

  test("responds 404 for another user's account, which survives", async () => {
    const ana = await signIn('ana@example.com')
    const ben = await signIn('ben@example.com')
    const account = await createAccount(db, { userId: ana.user.id, name: 'Wallet', type: 'cash' })

    expect((await call('DELETE', `/${account.id}`, { cookie: ben.cookie })).status).toBe(404)
    expect(await rowOf(account.id)).toEqual(account)
  })

  test.each([
    ['an id that does not exist', MISSING_ID],
    ['an id that is not a UUID', 'abc'],
  ])('responds 404 for %s', async (_label, id) => {
    const ana = await signIn('ana@example.com')

    expect((await call('DELETE', `/${id}`, { cookie: ana.cookie })).status).toBe(404)
  })

  test('refuses a cross-site DELETE with 403, and the account survives', async () => {
    const ana = await signIn('ana@example.com')
    const account = await createAccount(db, { userId: ana.user.id, name: 'Wallet', type: 'cash' })

    const res = await call('DELETE', `/${account.id}`, { cookie: ana.cookie, origin: 'http://evil.example' })

    expect(res.status).toBe(403)
    expect(await rowOf(account.id)).toEqual(account)
  })
})

test('the CORS preflight allows PATCH and DELETE with a JSON body from the web origin', async () => {
  const res = await fetch(`${running.baseUrl}/api/accounts/${MISSING_ID}`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'PATCH',
      'Access-Control-Request-Headers': 'content-type',
    },
  })

  expect(res.status).toBe(204)
  const allowed = res.headers.get('access-control-allow-methods') ?? ''
  expect(allowed).toContain('PATCH')
  expect(allowed).toContain('DELETE')
  expect(res.headers.get('access-control-allow-credentials')).toBe('true')
})
