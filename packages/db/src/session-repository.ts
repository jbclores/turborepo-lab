import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import type { Db } from './connection.js'
import { sessions, users } from './schema.js'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(
  db: Db,
  { userId, ttlMs, now = new Date() }: { userId: string; ttlMs: number; now?: Date },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + ttlMs)
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt })
  return { token, expiresAt }
}

export type SessionUser = { id: string; email: string; createdAt: Date }

export async function getSessionUser(db: Db, token: string, now: Date = new Date()): Promise<SessionUser | null> {
  const [found] = await db
    .select({ id: users.id, email: users.email, createdAt: users.createdAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
  return found ?? null
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
}
