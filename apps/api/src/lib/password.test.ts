import { describe, expect, test } from '@jest/globals'
import { hashPassword, verifyPassword } from './password.js'

const FAST = { cost: 4 } // the minimum bcrypt allows; keeps these tests quick

describe('hashPassword', () => {
  test('returns a bcrypt hash that does not contain the password', async () => {
    const hash = await hashPassword('correct horse battery', FAST)

    expect(hash).toMatch(/^\$2[aby]\$/)
    expect(hash).not.toContain('correct horse battery')
  })

  test('produces a different hash each time for the same password', async () => {
    const first = await hashPassword('correct horse battery', FAST)
    const second = await hashPassword('correct horse battery', FAST)

    expect(first).not.toBe(second)
  })

  test('uses a work factor of 12 by default', async () => {
    const hash = await hashPassword('correct horse battery')

    expect(hash.startsWith('$2b$12$')).toBe(true)
  })

  test('accepts a password of exactly 72 bytes', async () => {
    await expect(hashPassword('a'.repeat(72), FAST)).resolves.toMatch(/^\$2[aby]\$/)
  })

  test('refuses a password longer than 72 bytes instead of silently truncating it', async () => {
    await expect(hashPassword('a'.repeat(73), FAST)).rejects.toThrow(/72 bytes/)
  })

  test('counts bytes, not characters', async () => {
    const thirtySevenAccents = 'é'.repeat(37) // 37 characters, 74 bytes in UTF-8

    await expect(hashPassword(thirtySevenAccents, FAST)).rejects.toThrow(/72 bytes/)
  })
})

describe('verifyPassword', () => {
  test('accepts the password that was hashed', async () => {
    const hash = await hashPassword('correct horse battery', FAST)

    await expect(verifyPassword('correct horse battery', hash)).resolves.toBe(true)
  })

  test('rejects a different password', async () => {
    const hash = await hashPassword('correct horse battery', FAST)

    await expect(verifyPassword('wrong horse battery', hash)).resolves.toBe(false)
  })

  test('returns false, and does not throw, for a hash that is malformed', async () => {
    await expect(verifyPassword('anything', 'not-a-bcrypt-hash')).resolves.toBe(false)
  })
})
