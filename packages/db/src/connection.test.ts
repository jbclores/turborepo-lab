import { afterEach, describe, expect, test } from '@jest/globals'
import { createServer, type Socket } from 'node:net'
import type { AddressInfo } from 'node:net'
import { checkConnection, createDb } from './connection.js'
import { getTestDatabaseUrl } from './test-database.js'

const open: Array<{ close: () => Promise<void> }> = []

function connect(url: string, options?: { connectionTimeoutMs: number }) {
  const connection = createDb(url, options)
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

  test('is false, and returns promptly, when the server accepts a connection but never answers', async () => {
    const sockets: Socket[] = []
    const silent = createServer((socket) => sockets.push(socket))
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve))
    const port = (silent.address() as AddressInfo).port
    const { db } = connect(`postgres://lab:unused@127.0.0.1:${port}/lab_test`, {
      connectionTimeoutMs: 300,
    })

    const startedAt = Date.now()
    const result = await checkConnection(db)
    const elapsedMs = Date.now() - startedAt

    sockets.forEach((socket) => socket.destroy())
    await new Promise<void>((resolve) => silent.close(() => resolve()))
    expect(result).toBe(false)
    expect(elapsedMs).toBeLessThan(2000)
  })
})
