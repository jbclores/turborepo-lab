import type { Db } from '@lab/db'
import type { AuthResponse } from '@lab/schemas'
import { Router, type Response } from 'express'
import { requireUser, type AuthenticatedLocals } from '../middleware/require-user.js'

export function authRouter({ db }: { db: Db }) {
  const router = Router()

  router.get('/me', requireUser(db), (_req, res: Response<AuthResponse, AuthenticatedLocals>) => {
    const { id, email, createdAt } = res.locals.user
    res.json({ user: { id, email, createdAt: createdAt.toISOString() } })
  })

  return router
}
