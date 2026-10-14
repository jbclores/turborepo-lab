import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals'
import { createAccount, createDb, createSession, createTransaction, createUser, migrateDatabase, transactions, users } from '@lab/db'
import { getTestDatabaseUrl, resetTestDatabase } from '@lab/db/testing'
import { apiErrorSchema, transactionResponseSchema, transactionsResponseSchema } from '@lab/schemas'
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

async function signInWithAccount(email: string) {
  const user = await createUser(db, { email, passwordHash: 'not-used-here' })
  const { token } = await createSession(db, { userId: user.id, ttlMs: HOUR })
  const account = await createAccount(db, { userId: user.id, name: 'Wallet', type: 'cash' })
  return { user, account, cookie: `sid=${token}` }
}

function call(method: string, path: string, init: { cookie?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {}
  if (init.cookie) headers.Cookie = init.cookie
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  return fetch(`${running.baseUrl}/api${path}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

const allRows = () => db.select().from(transactions)
const valid = { amountCents: -25050, date: '2026-10-14', description: '  Groceries ' }

describe('without a session', () => {
  test.each([
    ['GET', `/accounts/${MISSING_ID}/transactions`],
    ['POST', `/accounts/${MISSING_ID}/transactions`],
    ['PATCH', `/transactions/${MISSING_ID}`],
    ['DELETE', `/transactions/${MISSING_ID}`],
  ])('%s %s responds 401', async (method, path) => {
    const res = await call(method, path, { body: method === 'POST' || method === 'PATCH' ? valid : undefined })

    expect(res.status).toBe(401)
  })
})

describe('POST /api/accounts/:id/transactions', () => {
  test('responds 201 with the transaction, description trimmed, no userId', async () => {
    const ana = await signInWithAccount('ana@example.com')

    const res = await call('POST', `/accounts/${ana.account.id}/transactions`, { cookie: ana.cookie, body: valid })

    expect(res.status).toBe(201)
    expect(transactionResponseSchema.parse(await res.json()).transaction).toMatchObject({
      accountId: ana.account.id,
      amountCents: -25050,
      date: '2026-10-14',
      description: 'Groceries',
    })
  })

  test('the URL decides the account: an accountId in the body is ignored', async () => {
    const ana = await signInWithAccount('ana@example.com')
    const other = await createAccount(db, { userId: ana.user.id, name: 'Bank', type: 'checking' })

    const res = await call('POST', `/accounts/${ana.account.id}/transactions`, {
      cookie: ana.cookie,
      body: { ...valid, accountId: other.id },
    })

    expect(transactionResponseSchema.parse(await res.json()).transaction.accountId).toBe(ana.account.id)
  })

  test.each([
    ['a zero amount', { ...valid, amountCents: 0 }],
    ['a fractional amount', { ...valid, amountCents: 1.5 }],
    ['an amount sent as text', { ...valid, amountCents: '250.50' }],
    ['an impossible date', { ...valid, date: '2026-02-30' }],
    ['an empty description', { ...valid, description: '  ' }],
  ])('responds 400 for %s and stores nothing', async (_label, body) => {
    const ana = await signInWithAccount('ana@example.com')

    const res = await call('POST', `/accounts/${ana.account.id}/transactions`, { cookie: ana.cookie, body })

    expect(res.status).toBe(400)
    expect(await allRows()).toHaveLength(0)
  })

  test.each([
    ["another user's account", 'other'],
    ['a missing account', MISSING_ID],
    ['an id that is not a UUID', 'abc'],
  ])('responds 404 for %s and stores nothing', async (_label, target) => {
    const ana = await signInWithAccount('ana@example.com')
    const ben = await signInWithAccount('ben@example.com')
    const id = target === 'other' ? ana.account.id : target

    const res = await call('POST', `/accounts/${id}/transactions`, { cookie: ben.cookie, body: valid })

    expect(res.status).toBe(404)
    expect(await allRows()).toHaveLength(0)
  })
})

describe('GET /api/accounts/:id/transactions', () => {
  test('lists the account, newest first', async () => {
    const ana = await signInWithAccount('ana@example.com')
    for (const [date, description] of [['2026-10-01', 'old'], ['2026-10-14', 'new']] as const) {
      await createTransaction(db, { userId: ana.user.id, accountId: ana.account.id, amountCents: -100, date, description })
    }

    const res = await call('GET', `/accounts/${ana.account.id}/transactions`, { cookie: ana.cookie })

    expect(transactionsResponseSchema.parse(await res.json()).transactions.map((t) => t.description)).toEqual(['new', 'old'])
  })

  test("responds 404 (not an empty list) for another user's account", async () => {
    const ana = await signInWithAccount('ana@example.com')
    const ben = await signInWithAccount('ben@example.com')

    const res = await call('GET', `/accounts/${ana.account.id}/transactions`, { cookie: ben.cookie })

    expect(res.status).toBe(404)
  })
})

describe('PATCH and DELETE /api/transactions/:id', () => {
  async function anaWithTransaction() {
    const ana = await signInWithAccount('ana@example.com')
    const t = await createTransaction(db, { userId: ana.user.id, accountId: ana.account.id, amountCents: -100, date: '2026-10-14', description: 'x' })
    return { ana, t: t! }
  }

  test('PATCH changes the amount and responds 200', async () => {
    const { ana, t } = await anaWithTransaction()

    const res = await call('PATCH', `/transactions/${t.id}`, { cookie: ana.cookie, body: { amountCents: 5000 } })

    expect(res.status).toBe(200)
    expect(transactionResponseSchema.parse(await res.json()).transaction.amountCents).toBe(5000)
  })

  test.each([
    ['a zero amount', { amountCents: 0 }],
    ['an impossible date', { date: '2026-02-30' }],
    ['a description of only spaces', { description: '   ' }],
  ])('PATCH responds 400 for %s and changes nothing', async (_label, body) => {
    const { ana, t } = await anaWithTransaction()

    const res = await call('PATCH', `/transactions/${t.id}`, { cookie: ana.cookie, body })

    expect(res.status).toBe(400)
    expect(await allRows()).toEqual([expect.objectContaining({ amountCents: -100, date: '2026-10-14', description: 'x' })])
  })

  test('PATCH cannot move a transaction to another account: accountId in the body is ignored', async () => {
    const { ana, t } = await anaWithTransaction()
    const other = await createAccount(db, { userId: ana.user.id, name: 'Bank', type: 'checking' })

    const res = await call('PATCH', `/transactions/${t.id}`, { cookie: ana.cookie, body: { amountCents: 5, accountId: other.id } })

    expect(transactionResponseSchema.parse(await res.json()).transaction.accountId).toBe(ana.account.id)
  })

  test('PATCH responds 400 for an empty change', async () => {
    const { ana, t } = await anaWithTransaction()

    expect((await call('PATCH', `/transactions/${t.id}`, { cookie: ana.cookie, body: {} })).status).toBe(400)
  })

  test("PATCH and DELETE respond 404 for another user's transaction, which is unchanged", async () => {
    const { t } = await anaWithTransaction()
    const ben = await signInWithAccount('ben@example.com')

    const patch = await call('PATCH', `/transactions/${t.id}`, { cookie: ben.cookie, body: { amountCents: 1 } })
    const del = await call('DELETE', `/transactions/${t.id}`, { cookie: ben.cookie })

    expect([patch.status, del.status]).toEqual([404, 404])
    expect(apiErrorSchema.parse(await del.json())).toEqual({ error: { code: 'not_found', message: 'Transaction not found' } })
    expect(await allRows()).toEqual([expect.objectContaining({ id: t.id, amountCents: -100 })])
  })

  test.each(['abc', MISSING_ID])('PATCH and DELETE respond 404 for %p', async (id) => {
    const { ana } = await anaWithTransaction()

    expect((await call('PATCH', `/transactions/${id}`, { cookie: ana.cookie, body: { amountCents: 1 } })).status).toBe(404)
    expect((await call('DELETE', `/transactions/${id}`, { cookie: ana.cookie })).status).toBe(404)
  })

  test('DELETE responds 204 and the transaction is gone', async () => {
    const { ana, t } = await anaWithTransaction()

    expect((await call('DELETE', `/transactions/${t.id}`, { cookie: ana.cookie })).status).toBe(204)
    expect(await allRows()).toHaveLength(0)
  })
})
