export const MAX_AMOUNT_CENTS = 99_999_999_999

const MAX_MESSAGE = 'The amount must be at most ₱999,999,999.99'
// Whole part: plain digits, or digits grouped in threes by commas. Then an optional .d or .dd.
const AMOUNT = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/
const TOO_MANY_DECIMALS = /^[\d,]+\.\d{3,}$/

type AmountResult = { ok: true; cents: number } | { ok: false; message: string }
const fail = (message: string): AmountResult => ({ ok: false, message })

// Reads what a person typed ("1,500.50") as integer cents, working on the text: never amount * 100,
// which is not exact in floating point (19.99 * 100 is 1998.9999999999998).
export function parseAmountToCents(text: string): AmountResult {
  const value = text.trim()
  if (value === '') return fail('Enter an amount')
  if (TOO_MANY_DECIMALS.test(value)) return fail('Use at most 2 decimal places')
  const match = AMOUNT.exec(value)
  if (!match?.[1]) return fail('Enter an amount like 250.50')
  const whole = match[1].replaceAll(',', '')
  const cents = Number(whole) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  if (cents === 0) return fail('The amount must be more than zero')
  if (cents > MAX_AMOUNT_CENTS) return fail(MAX_MESSAGE)
  return { ok: true, cents }
}

// The amount as a person would type it, without a sign: for prefilling an edit form.
export function centsToAmountText(cents: number): string {
  const abs = Math.abs(cents)
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

// For display only. Dividing by 100 is safe here: the result is rounded to 2 decimals for reading.
export function formatCents(cents: number): string {
  return peso.format(cents / 100)
}
