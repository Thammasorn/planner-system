import { describe, expect, it } from 'vitest'
import { z } from './z'

describe('src/lib/z', () => {
  it('runs Zod jitless so client parses never probe eval under the production CSP', () => {
    expect(z.config().jitless).toBe(true)
  })

  it('keeps the Thai locale as the default error map', () => {
    const r = z.object({ a: z.string() }).safeParse({ a: 1 })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toMatch(/[฀-๿]/)
  })
})
