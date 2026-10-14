import { sql } from 'drizzle-orm'
import { bigint, check, date, foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

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
    // Lets transactions reference (id, user_id) together, so a transaction can only point at its own user's account.
    unique('accounts_id_user_id_unique').on(table.id, table.userId),
  ],
)

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    // Integer cents, signed: +150000 is ₱1,500.00 in, -25050 is ₱250.50 out.
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    // A calendar day, no time zone, read and written as 'YYYY-MM-DD'.
    date: date('date', { mode: 'string' }).notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // (account_id, user_id) must be one of this user's accounts: the database refuses anything else.
    // ON DELETE NO ACTION (the default) blocks deleting an account that has transactions. The check sees the
    // whole statement's cascades, so deleting a user (which cascades here and to accounts) still works.
    // (RESTRICT would behave the same here: per the Postgres docs, the only difference is that NO ACTION
    // can be deferred to the end of a transaction, and this constraint is not deferrable.)
    foreignKey({
      name: 'transactions_account_owned_fk',
      columns: [table.accountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    check('transactions_amount_nonzero_within_limit', sql`${table.amountCents} <> 0 and abs(${table.amountCents}) <= 99999999999`),
    check(
      'transactions_description_trimmed_1_to_100',
      sql`${table.description} = btrim(${table.description}) and char_length(${table.description}) between 1 and 100`,
    ),
    index('transactions_account_id_date_idx').on(table.accountId, table.date),
  ],
)
