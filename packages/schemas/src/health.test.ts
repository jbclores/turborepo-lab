import { describe, expect, test } from '@jest/globals'
import { healthResponseSchema } from './health.js'

describe('healthResponseSchema', () => {
  test('accepts an ok status', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' })
  })

  test('rejects any other status value', () => {
    expect(healthResponseSchema.safeParse({ status: 'down' }).success).toBe(false)
  })

  test('rejects a payload without a status', () => {
    expect(healthResponseSchema.safeParse({}).success).toBe(false)
  })

  test('rejects a value that is not an object', () => {
    expect(healthResponseSchema.safeParse('ok').success).toBe(false)
  })
})
