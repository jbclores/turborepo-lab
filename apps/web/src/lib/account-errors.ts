import { ApiRequestError } from './api.js'

export type AccountErrorOutcome =
  | { field: 'name' | 'root'; message: string }
  | { signedOut: true }
  | { notFound: true; message: string }

// The API's answers, turned into what the accounts page should do.
export function describeAccountError(error: unknown): AccountErrorOutcome {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return { signedOut: true }
    if (error.code === 'account_name_taken') return { field: 'name', message: 'You already have an account with this name' }
    if (error.code === 'not_found') return { notFound: true, message: 'This account no longer exists' }
    if (error.code === 'account_has_transactions') return { field: 'root', message: "Delete this account's transactions first" }
  }
  return { field: 'root', message: 'Something went wrong. Please try again.' }
}

// The API's answers to a transaction change, turned into what the account page should do.
export function describeTransactionError(error: unknown): AccountErrorOutcome {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return { signedOut: true }
    if (error.code === 'not_found') return { notFound: true, message: 'This transaction no longer exists' }
  }
  return { field: 'root', message: 'Something went wrong. Please try again.' }
}
