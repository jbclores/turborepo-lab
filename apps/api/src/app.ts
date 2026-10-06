import { checkConnection, type Db } from '@lab/db'
import type { ApiError, HealthResponse } from '@lab/schemas'
import cors from 'cors'
import express, { Router, type NextFunction, type Request, type Response } from 'express'
import { authRouter } from './routes/auth.js'

type AppOptions = {
  webOrigin: string
  db: Db
  /** bcrypt work factor. Tests pass a low value; production uses the default. */
  passwordCost?: number
  /** How long a session lasts. */
  sessionTtlMs?: number
  /** Add the Secure cookie flag (HTTPS only). Turn on in production. */
  secureCookies?: boolean
  /** Where unexpected errors go. Defaults to console.error. */
  logError?: (error: unknown) => void
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function createApp({
  webOrigin,
  db,
  passwordCost,
  sessionTtlMs = SEVEN_DAYS_MS,
  secureCookies = false,
  logError = console.error,
}: AppOptions) {
  const app = express()

  app.use(cors({ origin: webOrigin }))
  app.use(express.json({ limit: '10kb' }))

  const api = Router()

  api.get('/health', (_req, res: Response<HealthResponse>) => {
    res.json({ status: 'ok' })
  })

  api.get('/health/db', async (_req, res: Response<HealthResponse | ApiError>) => {
    if (await checkConnection(db)) {
      res.json({ status: 'ok' })
      return
    }
    res.status(503).json({ error: { code: 'service_unavailable', message: 'Database is not reachable' } })
  })

  api.use('/auth', authRouter({ db, passwordCost, sessionTtlMs, secureCookies }))

  app.use('/api', api)

  // Registered last: any request no route handled gets the shared JSON error.
  app.use((_req, res: Response<ApiError>) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } })
  })

  // Error handler: always the shared JSON shape, and never details about what went wrong inside.
  app.use((error: unknown, _req: Request, res: Response<ApiError>, _next: NextFunction) => {
    const type = (error as { type?: string } | null)?.type
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'validation_error', message: 'Request body is not valid JSON' } })
      return
    }
    logError(error)
    res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong' } })
  })

  return app
}
