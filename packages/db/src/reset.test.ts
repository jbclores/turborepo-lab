import { afterAll, describe, expect, test } from '@jest/globals'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from './connection.js'
import { migrateDatabase } from './migrate.js'
import { getTestDatabaseUrl, resetTestDatabase } from './test-database.js'

describe('resetTestDatabase', () => {
  test('refuses to touch a database that is not lab_test, running nothing destructive', async () => {
    const statements: unknown[] = []
    // A stub on purpose: if this guard were broken, a real database would be at risk.
    const wrongDatabase = {
      execute: async (query: unknown) => {
        statements.push(query)
        return { rows: [{ name: 'lab_dev' }] }
      },
    } as unknown as Db

    await expect(resetTestDatabase(wrongDatabase)).rejects.toThrow(/lab_test/)
    expect(statements).toHaveLength(1)
  })

  describe('against the real lab_test database', () => {
    const { db, close } = createDb(getTestDatabaseUrl(process.env))
    afterAll(() => close())

    test('removes existing tables, so migrations can run from scratch', async () => {
      await db.execute(sql`create table if not exists scratch_table (id int)`)

      await resetTestDatabase(db)

      const result = await db.execute(sql`select to_regclass('public.scratch_table') as found`)
      expect(result.rows[0]?.found).toBeNull()
      await expect(migrateDatabase(db)).resolves.toBeUndefined()
    })
  })
})
