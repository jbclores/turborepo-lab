import { createSession, createUser, EmailTakenError, findUserByEmail, type Db } from '@lab/db'
import { loginInputSchema, registerInputSchema, type ApiError, type AuthResponse } from '@lab/schemas'
import { Router, type Response } from 'express'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { sessionCookieHeader } from '../lib/session-cookie.js'
import { requireUser, type AuthenticatedLocals } from '../middleware/require-user.js'

type AuthRouterOptions = {
  db: Db
  passwordCost: number | undefined
  sessionTtlMs: number
  secureCookies: boolean
}

// The public shape of a user: never the password hash.
function toPublicUser({ id, email, createdAt }: { id: string; email: string; createdAt: Date }) {
  return { id, email, createdAt: createdAt.toISOString() }
}

export function authRouter({ db, passwordCost, sessionTtlMs, secureCookies }: AuthRouterOptions) {
  const router = Router()
  // Compared against when the email is unknown, so that case costs as much time as a wrong password.
  // Made with the same work factor as real hashes, and started now so no request pays for it.
  const dummyHash = hashPassword('a password nobody has', { cost: passwordCost })

  // Every sign-in gets a brand new session token (never reuse one), delivered as a cookie.
  async function startSession(res: Response, userId: string) {
    const { token } = await createSession(db, { userId, ttlMs: sessionTtlMs })
    res.setHeader('Set-Cookie', sessionCookieHeader(token, { maxAgeMs: sessionTtlMs, secure: secureCookies }))
  }

  const invalidRequest = (res: Response<ApiError>) =>
    res.status(400).json({ error: { code: 'validation_error', message: 'Invalid request' } })

  router.get('/me', requireUser(db), (_req, res: Response<AuthResponse, AuthenticatedLocals>) => {
    res.json({ user: toPublicUser(res.locals.user) })
  })

  router.post('/register', async (req, res: Response<AuthResponse | ApiError>) => {
    const input = registerInputSchema.safeParse(req.body)
    if (!input.success) {
      invalidRequest(res)
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
    await startSession(res, user.id)
    res.status(201).json({ user: toPublicUser(user) })
  })

  router.post('/login', async (req, res: Response<AuthResponse | ApiError>) => {
    const input = loginInputSchema.safeParse(req.body)
    if (!input.success) {
      invalidRequest(res)
      return
    }
    const { email, password } = input.data
    const user = await findUserByEmail(db, email)
    const passwordMatches = await verifyPassword(password, user?.passwordHash ?? (await dummyHash))
    if (!user || !passwordMatches) {
      res.status(401).json({ error: { code: 'invalid_credentials', message: 'Invalid email or password' } })
      return
    }
    await startSession(res, user.id)
    res.json({ user: toPublicUser(user) })
  })

  return router
}
