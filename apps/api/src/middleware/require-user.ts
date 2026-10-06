import { getSessionUser, type Db, type SessionUser } from '@lab/db'
import type { ApiError } from '@lab/schemas'
import type { NextFunction, Request, Response } from 'express'
import { readSessionToken } from '../lib/session-cookie.js'

export type AuthenticatedLocals = { user: SessionUser }

// Lets a request through only when it carries a valid, unexpired session cookie.
export function requireUser(db: Db) {
  return async (req: Request, res: Response<ApiError, AuthenticatedLocals>, next: NextFunction) => {
    const token = readSessionToken(req.headers.cookie)
    const user = token ? await getSessionUser(db, token) : null
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } })
      return
    }
    res.locals.user = user
    next()
  }
}
