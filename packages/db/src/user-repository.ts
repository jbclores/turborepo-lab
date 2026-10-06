import { eq } from 'drizzle-orm'
import type { Db } from './connection.js'
import { users } from './schema.js'

export type User = typeof users.$inferSelect

export class EmailTakenError extends Error {
  constructor() {
    super('Email is already registered')
    this.name = 'EmailTakenError'
  }
}

// Drizzle wraps the Postgres error, so the code and constraint name sit on `cause`.
// Matched structurally (not with instanceof) so it works across module realms.
function isEmailUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; constraint?: string } } | null)?.cause
  return cause?.code === '23505' && cause.constraint === 'users_email_unique'
}

export async function createUser(db: Db, input: { email: string; passwordHash: string }): Promise<User> {
  try {
    const [user] = await db.insert(users).values(input).returning()
    if (!user) throw new Error('Insert returned no row')
    return user
  } catch (error) {
    if (isEmailUniqueViolation(error)) throw new EmailTakenError()
    throw error
  }
}

export async function findUserByEmail(db: Db, email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email))
  return user ?? null
}
