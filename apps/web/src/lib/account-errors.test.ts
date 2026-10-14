import { describe, expect, test } from '@jest/globals'
import { ApiRequestError } from './api.js'
import { describeAccountError } from './account-errors.js'

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
