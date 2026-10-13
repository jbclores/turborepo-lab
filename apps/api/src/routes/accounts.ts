import {
  AccountNameTakenError,
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
  type AccountRow,
  type Db,
} from '@lab/db'
import {
  createAccountInputSchema,
  updateAccountInputSchema,
  type AccountResponse,
  type AccountsResponse,
  type ApiError,
} from '@lab/schemas'
import { Router, type Response } from 'express'
import { requireUser, type AuthenticatedLocals } from '../middleware/require-user.js'

// Postgres throws on a malformed uuid, so anything else is answered as "not found" before any query.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The :id route param as a UUID, or null. Express 5 types params loosely (string | string[] | undefined).
const accountId = (param: unknown) => (typeof param === 'string' && UUID.test(param) ? param : null)

// The public shape of an account: never the userId.
function toPublicAccount({ id, name, type, createdAt }: AccountRow) {
  return { id, name, type, createdAt: createdAt.toISOString() }
}

const invalidRequest = (res: Response<ApiError>) =>
  res.status(400).json({ error: { code: 'validation_error', message: 'Invalid request' } })
// Also used for someone else's account, so a 404 never confirms that an account exists.
const notFound = (res: Response<ApiError>) =>
  res.status(404).json({ error: { code: 'not_found', message: 'Account not found' } })
const nameTaken = (res: Response<ApiError>) =>
  res.status(409).json({ error: { code: 'account_name_taken', message: 'An account with this name already exists' } })

export function accountsRouter({ db }: { db: Db }) {
  const router = Router()
  const signedIn = requireUser(db)

  router.get('/', signedIn, async (_req, res: Response<AccountsResponse, AuthenticatedLocals>) => {
    const list = await listAccounts(db, res.locals.user.id)
    res.json({ accounts: list.map(toPublicAccount) })
  })

  router.post('/', signedIn, async (req, res: Response<AccountResponse | ApiError, AuthenticatedLocals>) => {
    const input = createAccountInputSchema.safeParse(req.body)
    if (!input.success) {
      invalidRequest(res)
      return
    }
    try {
      const account = await createAccount(db, { userId: res.locals.user.id, ...input.data })
      res.status(201).json({ account: toPublicAccount(account) })
    } catch (error) {
      if (!(error instanceof AccountNameTakenError)) throw error
      nameTaken(res)
    }
  })

  router.patch('/:id', signedIn, async (req, res: Response<AccountResponse | ApiError, AuthenticatedLocals>) => {
    const id = accountId(req.params.id)
    if (!id) {
      notFound(res)
      return
    }
    const input = updateAccountInputSchema.safeParse(req.body)
    if (!input.success) {
      invalidRequest(res)
      return
    }
    try {
      const account = await updateAccount(db, { userId: res.locals.user.id, id, ...input.data })
      if (!account) {
        notFound(res)
        return
      }
      res.json({ account: toPublicAccount(account) })
    } catch (error) {
      if (!(error instanceof AccountNameTakenError)) throw error
      nameTaken(res)
    }
  })

  router.delete('/:id', signedIn, async (req, res: Response<ApiError, AuthenticatedLocals>) => {
    const id = accountId(req.params.id)
    if (!id || !(await deleteAccount(db, { userId: res.locals.user.id, id }))) {
      notFound(res)
      return
    }
    res.status(204).end()
  })

  return router
}
