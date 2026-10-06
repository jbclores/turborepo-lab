import { createSession, createUser, EmailTakenError, type Db } from '@lab/db'
import { registerInputSchema, type ApiError, type AuthResponse } from '@lab/schemas'
import { Router, type Response } from 'express'
import { hashPassword } from '../lib/password.js'
import { sessionCookieHeader } from '../lib/session-cookie.js'
import { requireUser, type AuthenticatedLocals } from '../middleware/require-user.js'

type AuthRouterOptions = {
  db: Db
  passwordCost: number | undefined
  sessionTtlMs: number
  secureCookies: boolean
}

export function authRouter({ db, passwordCost, sessionTtlMs, secureCookies }: AuthRouterOptions) {
  const router = Router()

  router.get('/me', requireUser(db), (_req, res: Response<AuthResponse, AuthenticatedLocals>) => {
    const { id, email, createdAt } = res.locals.user
    res.json({ user: { id, email, createdAt: createdAt.toISOString() } })
  })

  router.post('/register', async (req, res: Response<AuthResponse | ApiError>) => {
    const input = registerInputSchema.safeParse(req.body)
    if (!input.success) {
      res.status(400).json({ error: { code: 'validation_error', message: 'Invalid request' } })
      return
    }
    const { email, password } = input.data
    const passwordHash = await hashPassword(password, { cost: passwordCost })
    let user
    try {
      user = await createUser(db, { email, passwordHash })
    } catch (error) {
      if (error instanceof EmailTakenError) {
        res.status(409).json({ error: { code: 'email_taken', message: 'Email is already registered' } })
        return
      }
      throw error
    }
    const { token } = await createSession(db, { userId: user.id, ttlMs: sessionTtlMs })
    res.setHeader('Set-Cookie', sessionCookieHeader(token, { maxAgeMs: sessionTtlMs, secure: secureCookies }))
    res.status(201).json({ user: { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() } })
  })

  return router
}
