import bcrypt from 'bcrypt'

const DEFAULT_COST = 12
// bcrypt only reads the first 72 bytes. Hashing a longer password would silently ignore the rest.
const MAX_PASSWORD_BYTES = 72

export async function hashPassword(password: string, { cost = DEFAULT_COST } = {}): Promise<string> {
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new Error(`Password must be at most ${MAX_PASSWORD_BYTES} bytes`)
  }
  return bcrypt.hash(password, cost)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
