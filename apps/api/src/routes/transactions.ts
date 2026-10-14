import { deleteTransaction, updateTransaction, type Db, type TransactionRow } from '@lab/db'
import { updateTransactionInputSchema, type ApiError, type TransactionResponse } from '@lab/schemas'
import { Router, type Response } from 'express'
import { uuidParam } from '../lib/route-params.js'
import { requireUser, type AuthenticatedLocals } from '../middleware/require-user.js'

// The public shape of a transaction: never the userId.
export function toPublicTransaction({ id, accountId, amountCents, date, description, createdAt }: TransactionRow) {
  return { id, accountId, amountCents, date, description, createdAt: createdAt.toISOString() }
}

const invalidRequest = (res: Response<ApiError>) =>
  res.status(400).json({ error: { code: 'validation_error', message: 'Invalid request' } })
// Also used for someone else's transaction, so a 404 never confirms that one exists.
const notFound = (res: Response<ApiError>) =>
  res.status(404).json({ error: { code: 'not_found', message: 'Transaction not found' } })

export function transactionsRouter({ db }: { db: Db }) {
  const router = Router()
  const signedIn = requireUser(db)

  router.patch('/:id', signedIn, async (req, res: Response<TransactionResponse | ApiError, AuthenticatedLocals>) => {
    const id = uuidParam(req.params.id)
    if (!id) {
      notFound(res)
      return
    }
    const input = updateTransactionInputSchema.safeParse(req.body)
    if (!input.success) {
      invalidRequest(res)
      return
    }
    const transaction = await updateTransaction(db, { userId: res.locals.user.id, id, ...input.data })
    if (!transaction) {
      notFound(res)
      return
    }
    res.json({ transaction: toPublicTransaction(transaction) })
  })

  router.delete('/:id', signedIn, async (req, res: Response<ApiError, AuthenticatedLocals>) => {
    const id = uuidParam(req.params.id)
    if (!id || !(await deleteTransaction(db, { userId: res.locals.user.id, id }))) {
      notFound(res)
      return
    }
    res.status(204).end()
  })

  return router
}
