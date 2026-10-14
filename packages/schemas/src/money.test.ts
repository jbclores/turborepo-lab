import { describe, expect, test } from '@jest/globals'
import { centsToAmountText, formatCents, MAX_AMOUNT_CENTS, parseAmountToCents } from './money.js'

describe('parseAmountToCents', () => {
  test.each([
    ['250', 25000],
    ['250.5', 25050],
    ['250.50', 25050],
    ['0.01', 1],
    ['1,500.00', 150000],
    ['1,234,567.89', 123456789],
    [' 250.50 ', 25050],
    ['19.99', 1999], // 19.99 * 100 is 1998.9999999999998 in floating point
    ['999,999,999.99', MAX_AMOUNT_CENTS],
  ])('reads %p as %p cents', (text, cents) => {
    expect(parseAmountToCents(text)).toEqual({ ok: true, cents })
  })

  test.each([
    ['', 'Enter an amount'],
    ['   ', 'Enter an amount'],
    ['abc', 'Enter an amount like 250.50'],
    ['₱250', 'Enter an amount like 250.50'],
    ['-250', 'Enter an amount like 250.50'],
    ['1,5', 'Enter an amount like 250.50'],
    ['1,50,000', 'Enter an amount like 250.50'],
    ['250.', 'Enter an amount like 250.50'],
    ['.50', 'Enter an amount like 250.50'],
    ['250.505', 'Use at most 2 decimal places'],
    ['0', 'The amount must be more than zero'],
    ['0.00', 'The amount must be more than zero'],
    ['1,000,000,000', 'The amount must be at most ₱999,999,999.99'],
    ['99999999999999999999', 'The amount must be at most ₱999,999,999.99'],
  ])('refuses %p with %p', (text, message) => {
    expect(parseAmountToCents(text)).toEqual({ ok: false, message })
  })
})

describe('centsToAmountText', () => {
  test.each([
    [25050, '250.50'],
    [-25050, '250.50'],
    [150000, '1500.00'],
    [1, '0.01'],
    [MAX_AMOUNT_CENTS, '999999999.99'],
  ])('%p gives %p', (cents, text) => {
    expect(centsToAmountText(cents)).toBe(text)
  })

  test('round-trips through parseAmountToCents', () => {
    for (const cents of [1, 99, 100, 25050, 123456789, MAX_AMOUNT_CENTS]) {
      expect(parseAmountToCents(centsToAmountText(cents))).toEqual({ ok: true, cents })
    }
  })
})

describe('formatCents', () => {
  test.each([
    [150000, '₱1,500.00'],
    [-25050, '-₱250.50'],
    [0, '₱0.00'],
    [MAX_AMOUNT_CENTS, '₱999,999,999.99'],
  ])('%p is shown as %p', (cents, text) => {
    expect(formatCents(cents)).toBe(text)
  })
})
