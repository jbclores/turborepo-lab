import {
  AccountHasTransactionsError,
  AccountNameTakenError,
  createAccount,
  createTransaction,
  deleteAccount,
  getAccount,
  listAccounts,
  listTransactions,
  updateAccount,
  type AccountRow,
  type Db,
} from '@lab/db'
import {
  createAccountInputSchema,
  createTransactionInputSchema,
  updateAccountInputSchema,
  type AccountResponse,
  type AccountsResponse,
  type ApiError,
  type TransactionResponse,
  type TransactionsResponse,
} from '@lab/schemas'
import { Router, type Response } from 'express'
import { uuidParam } from '../lib/route-params.js'
import { requireUser, type AuthenticatedLocals } from '../middleware/require-user.js'
import { toPublicTransaction } from './transactions.js'

// The public shape of an account: never the userId.
function toPublicAccount({ id, name, type, createdAt }: AccountRow, balanceCents: number) {
  return { id, name, type, createdAt: createdAt.toISOString(), balanceCents }
}

const invalidRequest = (res: Response<ApiError>) =>
  res.status(400).json({ error: { code: 'validation_error', message: 'Invalid request' } })
// Also used for someone else's account, so a 404 never confirms that an account exists.
const notFound = (res: Response<ApiError>) =>
  res.status(404).json({ error: { code: 'not_found', message: 'Account not found' } })
const nameTaken = (res: Response<ApiError>) =>
  res.status(409).json({ error: { code: 'account_name_taken', message: 'An account with this name already exists' } })
const hasTransactions = (res: Response<ApiError>) =>
  res.status(409).json({ error: { code: 'account_has_transactions', message: 'This account has transactions' } })

export function accountsRouter({ db }: { db: Db }) {
  const router = Router()
  const signedIn = requireUser(db)

  router.get('/', signedIn, async (_req, res: Response<AccountsResponse, AuthenticatedLocals>) => {
    const list = await listAccounts(db, res.locals.user.id)
    res.json({ accounts: list.map((account) => toPublicAccount(account, account.balanceCents)) })
  })

  router.get('/:id', signedIn, async (req, res: Response<AccountResponse | ApiError, AuthenticatedLocals>) => {
    const id = uuidParam(req.params.id)
    const account = id ? await getAccount(db, { userId: res.locals.user.id, id }) : null
    if (!account) {
      notFound(res)
      return
    }
    res.json({ account: toPublicAccount(account, account.balanceCents) })
  })

  router.post('/', signedIn, async (req, res: Response<AccountResponse | ApiError, AuthenticatedLocals>) => {
    const input = createAccountInputSchema.safeParse(req.body)
    if (!input.success) {
      invalidRequest(res)
      return
    }
    try {
      const account = await createAccount(db, { userId: res.locals.user.id, ...input.data })
      // A new account has no transactions yet.
      res.status(201).json({ account: toPublicAccount(account, 0) })
    } catch (error) {
      if (!(error instanceof AccountNameTakenError)) throw error
      nameTaken(res)
    }
  })

  router.patch('/:id', signedIn, async (req, res: Response<AccountResponse | ApiError, AuthenticatedLocals>) => {
    const id = uuidParam(req.params.id)
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
      const withBalance = await getAccount(db, { userId: res.locals.user.id, id })
      res.json({ account: toPublicAccount(account, withBalance?.balanceCents ?? 0) })
    } catch (error) {
      if (!(error instanceof AccountNameTakenError)) throw error
      nameTaken(res)
    }
  })

  router.delete('/:id', signedIn, async (req, res: Response<ApiError, AuthenticatedLocals>) => {
    const id = uuidParam(req.params.id)
    try {
      if (!id || !(await deleteAccount(db, { userId: res.locals.user.id, id }))) {
        notFound(res)
        return
      }
    } catch (error) {
      if (!(error instanceof AccountHasTransactionsError)) throw error
      hasTransactions(res)
      return
    }
    res.status(204).end()
  })

  router.get('/:id/transactions', signedIn, async (req, res: Response<TransactionsResponse | ApiError, AuthenticatedLocals>) => {
    const userId = res.locals.user.id
    const id = uuidParam(req.params.id)
    // Checked first: for someone else's account an empty list would look like "no transactions yet".
    if (!id || !(await getAccount(db, { userId, id }))) {
      notFound(res)
      return
    }
    const transactions = await listTransactions(db, { userId, accountId: id })
    res.json({ transactions: transactions.map(toPublicTransaction) })
  })

  router.post('/:id/transactions', signedIn, async (req, res: Response<TransactionResponse | ApiError, AuthenticatedLocals>) => {
    const id = uuidParam(req.params.id)
    if (!id) {
      notFound(res)
      return
    }
    const input = createTransactionInputSchema.safeParse(req.body)
    if (!input.success) {
      invalidRequest(res)
      return
    }
    // null when the account is missing or not this user's: the database's ownership key refused it.
    const transaction = await createTransaction(db, { userId: res.locals.user.id, accountId: id, ...input.data })
    if (!transaction) {
      notFound(res)
      return
    }
    res.status(201).json({ transaction: toPublicTransaction(transaction) })
  })

  return router
}
