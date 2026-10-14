import { describe, expect, test } from '@jest/globals'
import { ApiRequestError } from './api.js'
import { describeAccountError, describeTransactionError } from './account-errors.js'

describe('describeAccountError', () => {
  test('a taken name goes on the name field', () => {
    expect(describeAccountError(new ApiRequestError(409, 'account_name_taken', 'x'))).toEqual({
      field: 'name',
      message: 'You already have an account with this name',
    })
  })

  test('a missing account (deleted elsewhere) says so', () => {
    expect(describeAccountError(new ApiRequestError(404, 'not_found', 'x'))).toEqual({
      notFound: true,
      message: 'This account no longer exists',
    })
  })

  test('an expired session means signed out', () => {
    expect(describeAccountError(new ApiRequestError(401, 'unauthorized', 'x'))).toEqual({ signedOut: true })
  })

  test.each([
    ['a 500', new ApiRequestError(500, 'internal_error', 'x')],
    ['a 400', new ApiRequestError(400, 'validation_error', 'x')],
    ['a network failure', new TypeError('fetch failed')],
  ])('anything else, such as %s, is a generic message on the form', (_label, error) => {
    expect(describeAccountError(error)).toEqual({ field: 'root', message: 'Something went wrong. Please try again.' })
  })
})

test('deleting an account with transactions says what to do', () => {
  expect(describeAccountError(new ApiRequestError(409, 'account_has_transactions', 'x'))).toEqual({
    field: 'root',
    message: "Delete this account's transactions first",
  })
})

describe('describeTransactionError', () => {
  test('a 404 means the transaction no longer exists', () => {
    expect(describeTransactionError(new ApiRequestError(404, 'not_found', 'x'))).toEqual({ notFound: true, message: 'This transaction no longer exists' })
  })

  test('a 401 means signed out', () => {
    expect(describeTransactionError(new ApiRequestError(401, 'unauthorized', 'x'))).toEqual({ signedOut: true })
  })

  test('anything else is a generic message on the form', () => {
    expect(describeTransactionError(new ApiRequestError(500, 'internal_error', 'x'))).toEqual({ field: 'root', message: 'Something went wrong. Please try again.' })
  })
})
