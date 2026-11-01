import { describe, expect, it } from 'vitest'
import { addWeeks } from '@/domain/dates'
import { th } from '@/i18n/th'
import { gridQuerySchema } from './grid'

type Parse = { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }

function messages(r: Parse): string[] {
  expect(r.success).toBe(false)
  return r.error!.issues.map((i) => i.message)
}

describe('gridQuerySchema (GET /api/grid/project/[projectId], X65)', () => {
  it('no params → { includeOthers: false, expand: [], zoom: week } (the route applies the −4/+12 window)', () => {
    expect(gridQuerySchema.parse({})).toEqual({ includeOthers: false, expand: [], zoom: 'week' })
  })

  it('from=2026-09-28&to=2026-11-23 ok', () => {
    expect(gridQuerySchema.parse({ from: '2026-09-28', to: '2026-11-23' })).toEqual({
      from: '2026-09-28',
      to: '2026-11-23',
      includeOthers: false,
      expand: [],
      zoom: 'week',
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

describe('gridQuerySchema › M7 expand / zoom (M7-D17)', () => {
  const win = { from: '2026-09-28', to: '2026-11-23' }

  it('expand=2026-09-28,2026-10-05 in the window → both Mondays', () => {
    expect(gridQuerySchema.parse({ ...win, expand: '2026-09-28,2026-10-05' }).expand).toEqual([
      '2026-09-28',
      '2026-10-05',
    ])
  })

  it('empty expand / trailing commas → []', () => {
    expect(gridQuerySchema.parse({ ...win, expand: '' }).expand).toEqual([])
    expect(gridQuerySchema.parse({ ...win, expand: '2026-09-28,' }).expand).toEqual(['2026-09-28'])
  })

  it('expand=2026-09-29 → weekNotMonday', () => {
    expect(messages(gridQuerySchema.safeParse({ ...win, expand: '2026-09-29' }))).toContain(
      th.grid.errors.weekNotMonday,
    )
  })

  it('expand outside [from, to) → expandOutOfRange (to is exclusive)', () => {
    expect(messages(gridQuerySchema.safeParse({ ...win, expand: '2026-12-07' }))).toEqual([
      th.grid.errors.expandOutOfRange,
    ])
    expect(messages(gridQuerySchema.safeParse({ ...win, expand: '2026-11-23' }))).toEqual([
      th.grid.errors.expandOutOfRange,
    ])
    expect(messages(gridQuerySchema.safeParse({ ...win, expand: '2026-09-21' }))).toEqual([
      th.grid.errors.expandOutOfRange,
    ])
    expect(gridQuerySchema.safeParse({ ...win, expand: '2026-11-16' }).success).toBe(true)
  })

  it('expand without from/to → badRange', () => {
    expect(messages(gridQuerySchema.safeParse({ expand: '2026-09-28' }))).toEqual([th.grid.errors.badRange])
  })

  it('zoom=day ok; zoom=DAY → error (lowercase only); zoom defaults to week', () => {
    expect(gridQuerySchema.parse({ zoom: 'day' }).zoom).toBe('day')
    expect(gridQuerySchema.parse({ ...win }).zoom).toBe('week')
    expect(gridQuerySchema.safeParse({ zoom: 'DAY' }).success).toBe(false)
  })

  it('53 expand entries ok; 54 → error', () => {
    const mondays = (n: number) => Array.from({ length: n }, (_, i) => addWeeks('2026-09-28', i))
    const w53 = { from: '2026-09-28', to: '2027-10-04' }
    expect(gridQuerySchema.safeParse({ ...w53, expand: mondays(53).join(',') }).success).toBe(true)
    expect(gridQuerySchema.safeParse({ ...w53, expand: mondays(54).join(',') }).success).toBe(false)
  })
})
