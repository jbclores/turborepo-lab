import type { ApiError, HealthResponse } from '@lab/schemas'
import cors from 'cors'
import express, { Router, type Response } from 'express'

type AppOptions = { webOrigin: string }

export function createApp({ webOrigin }: AppOptions) {
  const app = express()

  app.use(cors({ origin: webOrigin }))

  const api = Router()

  api.get('/health', (_req, res: Response<HealthResponse>) => {
    res.json({ status: 'ok' })
  })

  app.use('/api', api)

  // Registered last: any request no route handled gets the shared JSON error.
  app.use((_req, res: Response<ApiError>) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } })
  })

  return app
}
