import cors from 'cors'
import express, { Router } from 'express'

export const app = express()

app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' }))

const api = Router()

api.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api', api)
