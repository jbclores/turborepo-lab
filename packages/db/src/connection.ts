import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url })
  const db = drizzle(pool)
  return { db, close: () => pool.end() }
}

export type Db = ReturnType<typeof createDb>['db']

export async function checkConnection(db: Db): Promise<boolean> {
  try {
    await db.execute(sql`select 1`)
    return true
  } catch {
    return false
  }
}
