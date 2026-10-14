// Drizzle wraps the Postgres error; its SQLSTATE code and constraint name sit on `cause`.
// Matched structurally (not with instanceof) so it works across module realms.
export function isConstraintViolation(error: unknown, code: string, constraint: string): boolean {
  const cause = (error as { cause?: { code?: string; constraint?: string } } | null)?.cause
  return cause?.code === code && cause.constraint === constraint
}

export const FOREIGN_KEY_VIOLATION = '23503'
