import { z } from 'zod'

const nonEmptyString = z.string().min(1)

export const apiErrorSchema = z.object({
  error: z.object({
    code: nonEmptyString,
    message: nonEmptyString,
  }),
})
