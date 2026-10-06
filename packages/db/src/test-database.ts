import { sql } from 'drizzle-orm'
import type { Db } from './connection.js'

const LOCAL_HOSTS = ['localhost', '127.0.0.1']

export function getTestDatabaseUrl(env: Record<string, string | undefined>): string {
  const url = env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL is not set')

  const parsed = new URL(url)
  if (parsed.search) {
    throw new Error('Refusing to run tests: the URL must not have a query string')
  }
  if (parsed.pathname !== '/lab_test') {
    throw new Error('Refusing to run tests: the database must be lab_test')
  }
  if (!LOCAL_HOSTS.includes(parsed.hostname)) {
    throw new Error('Refusing to run tests: the host must be localhost')
  }
  return url
}

export async function resetTestDatabase(db: Db): Promise<void> {
  const result = await db.execute(sql`select current_database() as name`)
  if (result.rows[0]?.name !== 'lab_test') {
    throw new Error('Refusing to reset: the connected database is not lab_test')
  }

  await db.execute(sql`drop schema if exists public cascade`)
  await db.execute(sql`drop schema if exists drizzle cascade`)
  await db.execute(sql`create schema public`)
}
