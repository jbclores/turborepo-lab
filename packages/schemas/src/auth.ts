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
const byteLimitMessage = `Password must be at most ${MAX_PASSWORD_BYTES} bytes`

const email = z.string().trim().toLowerCase().pipe(z.email())

export const registerInputSchema = z.object({
  email,
  password: z.string().min(12).refine(withinByteLimit, byteLimitMessage),
})

export const loginInputSchema = z.object({
  email,
  password: z.string().min(1).refine(withinByteLimit, byteLimitMessage),
})

// strict: an object carrying extra fields (such as a passwordHash) is rejected, not silently trimmed.
export const publicUserSchema = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  createdAt: z.iso.datetime(),
})

export const authResponseSchema = z.object({ user: publicUserSchema })
