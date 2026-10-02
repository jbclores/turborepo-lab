import express, { Router } from 'express'

export const app = express()

const api = Router()

api.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api', api)
