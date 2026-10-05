import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 3001)
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173'

createApp({ webOrigin }).listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
