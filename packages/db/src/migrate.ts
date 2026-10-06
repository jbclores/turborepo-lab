import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import type { Db } from './connection.js'

// The generated SQL files live in packages/db/drizzle, next to src and dist.
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

export async function migrateDatabase(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder })
}
