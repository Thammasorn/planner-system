import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { gridQuerySchema } from './grid'

type Parse = { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }

function messages(r: Parse): string[] {
  expect(r.success).toBe(false)
  return r.error!.issues.map((i) => i.message)
}

describe('gridQuerySchema (GET /api/grid/project/[projectId], X65)', () => {
  it('no params → { includeOthers: false } (the route applies the −4/+12 window)', () => {
    expect(gridQuerySchema.parse({})).toEqual({ includeOthers: false })
  })

  it('from=2026-09-28&to=2026-11-23 ok', () => {
    expect(gridQuerySchema.parse({ from: '2026-09-28', to: '2026-11-23' })).toEqual({
      from: '2026-09-28',
      to: '2026-11-23',
      includeOthers: false,
    })
  })

  it('Tuesday → weekNotMonday', () => {
    expect(messages(gridQuerySchema.safeParse({ from: '2026-09-29', to: '2026-11-23' }))).toContain(
      th.grid.errors.weekNotMonday,
    )
  })

  it('to = from → badRange; 54 weeks → badRange; 53 weeks ok; only from → badRange', () => {
    expect(messages(gridQuerySchema.safeParse({ from: '2026-09-28', to: '2026-09-28' }))).toEqual([
      th.grid.errors.badRange,
    ])
    expect(messages(gridQuerySchema.safeParse({ from: '2026-09-28', to: '2027-10-11' }))).toEqual([
      th.grid.errors.badRange,
    ])
    expect(gridQuerySchema.safeParse({ from: '2026-09-28', to: '2027-10-04' }).success).toBe(true)
    expect(messages(gridQuerySchema.safeParse({ from: '2026-09-28' }))).toEqual([th.grid.errors.badRange])
    expect(messages(gridQuerySchema.safeParse({ to: '2026-09-28' }))).toEqual([th.grid.errors.badRange])
  })

  it('includeOthers=1 → true, =0 → false, =yes → error', () => {
    expect(gridQuerySchema.parse({ includeOthers: '1' }).includeOthers).toBe(true)
    expect(gridQuerySchema.parse({ includeOthers: '0' }).includeOthers).toBe(false)
    expect(gridQuerySchema.safeParse({ includeOthers: 'yes' }).success).toBe(false)
  })

  it('a malformed date fails without crashing the refinements', () => {
    expect(gridQuerySchema.safeParse({ from: 'x', to: '2026-11-23' }).success).toBe(false)
  })
})
