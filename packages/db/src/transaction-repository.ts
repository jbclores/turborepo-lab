import { and, desc, eq } from 'drizzle-orm'
import type { Db } from './connection.js'
import { FOREIGN_KEY_VIOLATION, isConstraintViolation } from './postgres-error.js'
import { transactions } from './schema.js'

export type TransactionRow = typeof transactions.$inferSelect

const owned = (userId: string, id: string) => and(eq(transactions.id, id), eq(transactions.userId, userId))

// null when the account is missing or belongs to someone else: the ownership key refuses the row,
// in the same statement, so there is no separate lookup for a race to slip past.
export async function createTransaction(
  db: Db,
  input: { userId: string; accountId: string; amountCents: number; date: string; description: string },
): Promise<TransactionRow | null> {
  try {
    const [transaction] = await db.insert(transactions).values(input).returning()
    if (!transaction) throw new Error('Insert returned no row')
    return transaction
  } catch (error) {
    if (isConstraintViolation(error, FOREIGN_KEY_VIOLATION, 'transactions_account_owned_fk')) return null
    throw error
  }
}

export async function listTransactions(
  db: Db,
  { userId, accountId }: { userId: string; accountId: string },
): Promise<TransactionRow[]> {
  return db
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), eq(transactions.userId, userId)))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
}

export async function updateTransaction(
  db: Db,
  {
    userId,
    id,
    amountCents,
    date,
    description,
  }: { userId: string; id: string; amountCents?: number; date?: string; description?: string },
): Promise<TransactionRow | null> {
  if (amountCents === undefined && date === undefined && description === undefined) throw new Error('Nothing to update')
  const [transaction] = await db
    .update(transactions)
    .set({
      ...(amountCents !== undefined && { amountCents }),
      ...(date !== undefined && { date }),
      ...(description !== undefined && { description }),
    })
    .where(owned(userId, id))
    .returning()
  return transaction ?? null
}

export async function deleteTransaction(db: Db, { userId, id }: { userId: string; id: string }): Promise<boolean> {
  const deleted = await db.delete(transactions).where(owned(userId, id)).returning({ id: transactions.id })
  return deleted.length > 0
}
