import { afterEach, describe, expect, test } from '@jest/globals'
import { checkConnection, createDb } from './connection.js'
import { getTestDatabaseUrl } from './test-database.js'

const open: Array<{ close: () => Promise<void> }> = []

function connect(url: string) {
  const connection = createDb(url)
  open.push(connection)
  return connection
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close()))
})

describe('checkConnection', () => {
  test('is true for a reachable database', async () => {
    const { db } = connect(getTestDatabaseUrl(process.env))

    await expect(checkConnection(db)).resolves.toBe(true)
  })

  test('is false when the database cannot be reached', async () => {
    const { db } = connect('postgres://lab:unused@127.0.0.1:1/lab_test')

    await expect(checkConnection(db)).resolves.toBe(false)
  })
})
