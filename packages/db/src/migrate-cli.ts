import { createDb } from './connection.js'
import { migrateDatabase } from './migrate.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is not set (see .env.example)')

const { db, close } = createDb(databaseUrl)
try {
  await migrateDatabase(db)
  console.log('Migrations applied')
} finally {
  await close()
}
