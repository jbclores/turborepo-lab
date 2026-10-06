import type { Express } from 'express'
import type { AddressInfo } from 'node:net'

export type RunningApp = { baseUrl: string; close: () => Promise<void> }

// Starts the app on a random free port, so tests call it with real HTTP and never clash.
export async function startApp(app: Express): Promise<RunningApp> {
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  return {
    baseUrl: `http://localhost:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  }
}
