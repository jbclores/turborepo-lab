import { describe, expect, test } from '@jest/globals'
import { authResponseSchema, loginInputSchema, registerInputSchema } from './auth.js'

const validPassword = 'correct horse battery'

describe('registerInputSchema', () => {
  test('accepts an email and a password of at least 12 characters', () => {
    const input = { email: 'ana@example.com', password: validPassword }

    expect(registerInputSchema.parse(input)).toEqual(input)
  })

  test('trims and lowercases the email', () => {
    const parsed = registerInputSchema.parse({ email: '  Ana@Example.COM ', password: validPassword })

    expect(parsed.email).toBe('ana@example.com')
  })

  test('rejects an email that is not an email address', () => {
    expect(registerInputSchema.safeParse({ email: 'not-an-email', password: validPassword }).success).toBe(false)
  })

  test('rejects a password shorter than 12 characters', () => {
    expect(registerInputSchema.safeParse({ email: 'ana@example.com', password: 'a'.repeat(11) }).success).toBe(false)
  })

  test('accepts a password of exactly 72 bytes', () => {
    expect(registerInputSchema.safeParse({ email: 'ana@example.com', password: 'a'.repeat(72) }).success).toBe(true)
  })

  test('rejects a password longer than 72 bytes, counting bytes and not characters', () => {
    const accents = 'é'.repeat(37) // 37 characters but 74 bytes in UTF-8

    expect(registerInputSchema.safeParse({ email: 'ana@example.com', password: accents }).success).toBe(false)
  })
})

describe('the password byte limit', () => {
  test('counts a 4-byte emoji as 4 bytes: 18 fit in 72 bytes, 19 do not', () => {
    const emoji = '😀'
    const email = 'ana@example.com'

    expect(registerInputSchema.safeParse({ email, password: emoji.repeat(18) }).success).toBe(true)
    expect(registerInputSchema.safeParse({ email, password: emoji.repeat(19) }).success).toBe(false)
  })
})

describe('loginInputSchema', () => {
  test('accepts an email and any non-empty password, even a short one', () => {
    const input = { email: 'ana@example.com', password: 'short' }

    expect(loginInputSchema.parse(input)).toEqual(input)
  })

  test('trims and lowercases the email', () => {
    expect(loginInputSchema.parse({ email: ' ANA@example.com', password: 'x' }).email).toBe('ana@example.com')
  })

  test('rejects an empty password', () => {
    expect(loginInputSchema.safeParse({ email: 'ana@example.com', password: '' }).success).toBe(false)
  })

  test('rejects a password longer than 72 bytes', () => {
    expect(loginInputSchema.safeParse({ email: 'ana@example.com', password: 'a'.repeat(73) }).success).toBe(false)
  })
})

describe('authResponseSchema', () => {
  const user = {
    id: '3f2b8c1e-5d6a-4b7c-9e0f-1a2b3c4d5e6f',
    email: 'ana@example.com',
    createdAt: '2026-10-06T10:00:00.000Z',
  }

  test('accepts a response with a public user', () => {
    expect(authResponseSchema.parse({ user })).toEqual({ user })
  })

  test('rejects a user that carries a passwordHash, so a leak fails loudly', () => {
    expect(authResponseSchema.safeParse({ user: { ...user, passwordHash: '$2b$12$secret' } }).success).toBe(false)
  })

  test('rejects a user whose id is not a UUID', () => {
    expect(authResponseSchema.safeParse({ user: { ...user, id: 'not-a-uuid' } }).success).toBe(false)
  })

  test('rejects a user whose createdAt is not an ISO date-time', () => {
    expect(authResponseSchema.safeParse({ user: { ...user, createdAt: 'yesterday' } }).success).toBe(false)
  })

  test('rejects a user whose email is not an email address', () => {
    expect(authResponseSchema.safeParse({ user: { ...user, email: 'nope' } }).success).toBe(false)
  })
})

describe('validation messages (shown under the form fields)', () => {
  // The first message for each field, the one the form shows.
  function messages(schema: typeof loginInputSchema, input: unknown): Record<string, string> {
    const result = schema.safeParse(input)
    if (result.success) return {}
    const byField: Record<string, string> = {}
    for (const issue of result.error.issues) byField[String(issue.path[0])] ??= issue.message
    return byField
  }

  test('an email that is not an email address', () => {
    expect(messages(registerInputSchema, { email: 'not-an-email', password: validPassword })).toEqual({
      email: 'Enter a valid email address',
    })
  })

  test('an empty email', () => {
    expect(messages(loginInputSchema, { email: '', password: 'x' })).toEqual({ email: 'Enter a valid email address' })
  })

  test('a register password shorter than 12 characters', () => {
    expect(messages(registerInputSchema, { email: 'ana@example.com', password: 'a'.repeat(11) })).toEqual({
      password: 'Password must be at least 12 characters',
    })
  })

  test('an empty login password', () => {
    expect(messages(loginInputSchema, { email: 'ana@example.com', password: '' })).toEqual({
      password: 'Enter your password',
    })
  })

  test.each([
    ['register', registerInputSchema],
    ['login', loginInputSchema],
  ])('a %s password over 72 bytes says why, in words a user understands', (_name, schema) => {
    expect(messages(schema, { email: 'ana@example.com', password: 'é'.repeat(37) })).toEqual({
      password: 'Password is too long: use at most 72 characters (accented letters and emoji count as more than one)',
    })
  })
})
