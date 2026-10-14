import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm'
import type { Db } from './connection.js'
import { FOREIGN_KEY_VIOLATION, isConstraintViolation } from './postgres-error.js'
import { accounts, transactions } from './schema.js'

export type AccountRow = typeof accounts.$inferSelect
export type AccountWithBalance = AccountRow & { balanceCents: number }

export class AccountNameTakenError extends Error {
  constructor() {
    super('An account with this name already exists')
    this.name = 'AccountNameTakenError'
  }
}

export class AccountHasTransactionsError extends Error {
  constructor() {
    super('This account has transactions')
    this.name = 'AccountHasTransactionsError'
  }
}

// Same structural match as isEmailUniqueViolation: Drizzle puts the Postgres error on `cause`.
function isNameUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; constraint?: string } } | null)?.cause
  return cause?.code === '23505' && cause.constraint === 'accounts_user_id_lower_name_unique'
}

// Every query below filters on userId: there is no way to reach an account by id alone.
const owned = (userId: string, id: string) => and(eq(accounts.id, id), eq(accounts.userId, userId))

export async function createAccount(
  db: Db,
  input: { userId: string; name: string; type: AccountRow['type'] },
): Promise<AccountRow> {
  try {
    const [account] = await db.insert(accounts).values(input).returning()
    if (!account) throw new Error('Insert returned no row')
    return account
  } catch (error) {
    if (isNameUniqueViolation(error)) throw new AccountNameTakenError()
    throw error
  }
}

// Summed on read, never stored, so it cannot drift. Postgres returns SUM(bigint) as numeric text;
// mapWith(Number) is exact while a balance stays under 2^53 cents (about 90 trillion pesos).
const balanceCents = sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(Number)

const withBalance = (db: Db) =>
  db
    .select({ ...getTableColumns(accounts), balanceCents })
    .from(accounts)
    .leftJoin(transactions, eq(transactions.accountId, accounts.id))

export async function listAccounts(db: Db, userId: string): Promise<AccountWithBalance[]> {
  return withBalance(db)
    .where(eq(accounts.userId, userId))
    .groupBy(accounts.id)
    .orderBy(sql`lower(${accounts.name})`, asc(accounts.createdAt))
}

export async function getAccount(db: Db, { userId, id }: { userId: string; id: string }): Promise<AccountWithBalance | null> {
  const [account] = await withBalance(db).where(owned(userId, id)).groupBy(accounts.id)
  return account ?? null
}

// null when the account does not exist or belongs to someone else: the caller cannot tell which.
// Returns the account with its balance, read in the same statement as the update, so a concurrent
// delete cannot slip in between (null when missing or not this user's).
export async function updateAccount(
  db: Db,
  { userId, id, name, type }: { userId: string; id: string; name?: string; type?: AccountRow['type'] },
): Promise<AccountWithBalance | null> {
  if (name === undefined && type === undefined) throw new Error('Nothing to update')
  try {
    const [account] = await db
      .update(accounts)
      .set({ ...(name !== undefined && { name }), ...(type !== undefined && { type }) })
      .where(owned(userId, id))
      .returning({
        ...getTableColumns(accounts),
        // Written out by hand: in RETURNING, Drizzle prints columns without their table, and inside this
        // subquery a bare "id" would mean transactions.id. The alias and "accounts"."id" make it unambiguous.
        balanceCents: sql<number>`(select coalesce(sum(t.amount_cents), 0) from transactions t where t.account_id = "accounts"."id")`.mapWith(Number),
      })
    return account ?? null
  } catch (error) {
    if (isNameUniqueViolation(error)) throw new AccountNameTakenError()
    throw error
  }
}

// Refused by the database when the account has transactions (the ownership key has no ON DELETE action).
export async function deleteAccount(db: Db, { userId, id }: { userId: string; id: string }): Promise<boolean> {
  try {
    const deleted = await db.delete(accounts).where(owned(userId, id)).returning({ id: accounts.id })
    return deleted.length > 0
  } catch (error) {
    if (isConstraintViolation(error, FOREIGN_KEY_VIOLATION, 'transactions_account_owned_fk')) {
      throw new AccountHasTransactionsError()
    }
    throw error
  }
}

// A cheap existence check (no balance): is this one of the user's accounts?
export async function ownsAccount(db: Db, { userId, id }: { userId: string; id: string }): Promise<boolean> {
  const [found] = await db.select({ id: accounts.id }).from(accounts).where(owned(userId, id))
  return found !== undefined
}
