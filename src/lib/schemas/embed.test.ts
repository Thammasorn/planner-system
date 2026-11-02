import { describe, expect, it } from 'vitest'
import { embedParamsSchema } from './embed'

describe('embedParamsSchema (M10-D1, X86)', () => {
  it('accepts a uuid page id only', () => {
    expect(embedParamsSchema.safeParse({ id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }).success).toBe(true)
    expect(embedParamsSchema.safeParse({ id: 'nope' }).success).toBe(false)
    expect(embedParamsSchema.safeParse({}).success).toBe(false)
  })
})
