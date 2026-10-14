import { sql } from 'drizzle-orm'
import { check, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Only a hash of the session token is stored, so a database leak does not expose live sessions.
  tokenHash: text('token_hash').notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const accountType = pgEnum('account_type', ['checking', 'savings', 'cash', 'credit_card'])

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: accountType('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One name per user, ignoring case. Postgres enforces it, so two requests at once cannot both win.
    // lower() folds non-ASCII letters (É/é) only when the database's ctype is UTF-8, as it is for
    // lab_dev and lab_test; a database created with the C locale would treat them as different names.
    uniqueIndex('accounts_user_id_lower_name_unique').on(table.userId, sql`lower(${table.name})`),
    // The same rule as the shared schema (trimmed, 1 to 50 characters), for callers that skip the API.
    check('accounts_name_trimmed_1_to_50', sql`${table.name} = btrim(${table.name}) and char_length(${table.name}) between 1 and 50`),
  ],
)
