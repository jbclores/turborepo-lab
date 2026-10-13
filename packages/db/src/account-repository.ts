import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from './connection.js'
import { accounts } from './schema.js'

export type AccountRow = typeof accounts.$inferSelect

export class AccountNameTakenError extends Error {
  constructor() {
    super('An account with this name already exists')
    this.name = 'AccountNameTakenError'
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

export async function listAccounts(db: Db, userId: string): Promise<AccountRow[]> {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(sql`lower(${accounts.name})`, asc(accounts.createdAt))
}

// null when the account does not exist or belongs to someone else: the caller cannot tell which.
export async function updateAccount(
  db: Db,
  { userId, id, name, type }: { userId: string; id: string; name?: string; type?: AccountRow['type'] },
): Promise<AccountRow | null> {
  if (name === undefined && type === undefined) throw new Error('Nothing to update')
  try {
    const [account] = await db
      .update(accounts)
      .set({ ...(name !== undefined && { name }), ...(type !== undefined && { type }) })
      .where(owned(userId, id))
      .returning()
    return account ?? null
  } catch (error) {
    if (isNameUniqueViolation(error)) throw new AccountNameTakenError()
    throw error
  }
}

export async function deleteAccount(db: Db, { userId, id }: { userId: string; id: string }): Promise<boolean> {
  const deleted = await db.delete(accounts).where(owned(userId, id)).returning({ id: accounts.id })
  return deleted.length > 0
}
