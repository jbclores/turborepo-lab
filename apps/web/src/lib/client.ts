import { createApiGet } from './api'

// The only place that reads the Vite env var. Everything else receives the URL as an argument.
export const apiGet = createApiGet(import.meta.env.VITE_API_URL ?? 'http://localhost:3001')
