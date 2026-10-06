import { createDb } from '@lab/db'
import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 3001)
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173'
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is not set (see .env.example)')

const { db } = createDb(databaseUrl)

createApp({ webOrigin, db, secureCookies: process.env.NODE_ENV === 'production' }).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
