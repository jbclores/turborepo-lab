import type { ApiError } from '@lab/schemas'
import type { NextFunction, Request, Response } from 'express'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// CSRF defense for cookie sessions. The browser attaches the session cookie on its own, so a page on
// another site could make it send a POST to this API. Browsers always say where such a request came
// from (the Origin header), so a state-changing request from any other origin is refused.
// A request with no Origin header is not a browser cross-site request, and is let through.
export function requireAllowedOrigin(allowedOrigin: string) {
  return (req: Request, res: Response<ApiError>, next: NextFunction) => {
    const origin = req.headers.origin
    if (SAFE_METHODS.has(req.method) || origin === undefined || origin === allowedOrigin) {
      next()
      return
    }
    res.status(403).json({ error: { code: 'forbidden_origin', message: 'Origin not allowed' } })
  }
}
