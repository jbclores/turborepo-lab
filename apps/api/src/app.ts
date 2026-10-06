import { checkConnection, type Db } from '@lab/db'
import type { ApiError, HealthResponse } from '@lab/schemas'
import cors from 'cors'
import express, { Router, type Response } from 'express'
import { authRouter } from './routes/auth.js'

type AppOptions = { webOrigin: string; db: Db }

export function createApp({ webOrigin, db }: AppOptions) {
  const app = express()

  app.use(cors({ origin: webOrigin }))

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

  api.use('/auth', authRouter({ db }))

  app.use('/api', api)

  // Registered last: any request no route handled gets the shared JSON error.
  app.use((_req, res: Response<ApiError>) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } })
  })

  return app
}
