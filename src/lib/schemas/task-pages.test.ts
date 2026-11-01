import { describe, expect, it } from 'vitest'
import { ensureTaskBodySchema, taskBodyParamsSchema } from './task-pages'

const T = '0b7f6a52-9c1e-4d3b-a2f4-5e6d7c8b9a01'

describe('task-page schemas (M6.1-D6/D7)', () => {
  it('ensureTaskBody needs a uuid taskId', () => {
    expect(ensureTaskBodySchema.parse({ taskId: T })).toEqual({ taskId: T })
    expect(ensureTaskBodySchema.safeParse({ taskId: 'x' }).success).toBe(false)
    expect(ensureTaskBodySchema.safeParse({}).success).toBe(false)
  })

  it('route params: malformed ids fail (→ 404 in the handler, X86)', () => {
    expect(taskBodyParamsSchema.parse({ id: T })).toEqual({ id: T })
    expect(taskBodyParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false)
  })
})
