import { describe, expect, test } from '@jest/globals'
import { apiErrorSchema } from './error.js'

describe('apiErrorSchema', () => {
  test('accepts an error with a code and a message', () => {
    const body = { error: { code: 'not_found', message: 'Route not found' } }

    expect(apiErrorSchema.parse(body)).toEqual(body)
  })

  test('rejects an empty message', () => {
    const body = { error: { code: 'not_found', message: '' } }

    expect(apiErrorSchema.safeParse(body).success).toBe(false)
  })

  test('rejects a body without the error object', () => {
    expect(apiErrorSchema.safeParse({}).success).toBe(false)
  })

  test('rejects an empty code', () => {
    const body = { error: { code: '', message: 'Route not found' } }

    expect(apiErrorSchema.safeParse(body).success).toBe(false)
  })
})
