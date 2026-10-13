import { z } from 'zod'

// bcrypt only reads the first 72 bytes, so longer passwords are refused (bytes, not characters).
const MAX_PASSWORD_BYTES = 72
// Counted by hand: this package runs in the browser and in Node and has neither DOM nor Node types.
function utf8ByteLength(value: string): number {
  let bytes = 0
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
  }
  return bytes
}

const withinByteLimit = (value: string) => utf8ByteLength(value) <= MAX_PASSWORD_BYTES
// Users think in characters, not bytes, so the message says characters and explains the exception.
const byteLimitMessage = `Password is too long: use at most ${MAX_PASSWORD_BYTES} characters (accented letters and emoji count as more than one)`

// These messages are shown under the form fields, so they say what to do, not what went wrong.
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'))

export const registerInputSchema = z.object({
  email,
  password: z.string().min(12, 'Password must be at least 12 characters').refine(withinByteLimit, byteLimitMessage),
})

export const loginInputSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').refine(withinByteLimit, byteLimitMessage),
})

// strict: an object carrying extra fields (such as a passwordHash) is rejected, not silently trimmed.
export const publicUserSchema = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  createdAt: z.iso.datetime(),
})

export const authResponseSchema = z.object({ user: publicUserSchema })

export type AuthResponse = z.infer<typeof authResponseSchema>
