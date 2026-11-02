import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { personTimeOffQuerySchema, workloadCellQuerySchema, workloadQuerySchema } from './workload'

type Parse = { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }

function messages(r: Parse): string[] {
  expect(r.success).toBe(false)
  return r.error!.issues.map((i) => i.message)
}

describe('workloadQuerySchema (GET /api/workload, M9-D2/D4/D5)', () => {
  it('no params → { onlyOver: false } (the route applies the 12-week window)', () => {
    expect(workloadQuerySchema.parse({})).toEqual({ onlyOver: false })
  })

  it('from=2026-09-28&to=2026-12-21 ok', () => {
    expect(workloadQuerySchema.parse({ from: '2026-09-28', to: '2026-12-21' })).toEqual({
      from: '2026-09-28',
      to: '2026-12-21',
      onlyOver: false,
    })
  })

  it('a Tuesday → weekNotMonday', () => {
    expect(messages(workloadQuerySchema.safeParse({ from: '2026-09-29', to: '2026-12-21' }))).toContain(
      th.grid.errors.weekNotMonday,
    )
  })

  it('only from → badRange; to = from → badRange; 54 weeks → badRange; 53 weeks ok', () => {
    expect(messages(workloadQuerySchema.safeParse({ from: '2026-09-28' }))).toEqual([th.grid.errors.badRange])
    expect(messages(workloadQuerySchema.safeParse({ from: '2026-09-28', to: '2026-09-28' }))).toEqual([
      th.grid.errors.badRange,
    ])
    // 2026-01-05 → 2027-01-18 = 378 days = 54 weeks; → 2027-01-11 = 371 days = 53 weeks (the limit, ok)
    expect(messages(workloadQuerySchema.safeParse({ from: '2026-01-05', to: '2027-01-18' }))).toEqual([
      th.grid.errors.badRange,
    ])
    expect(workloadQuerySchema.safeParse({ from: '2026-01-05', to: '2027-01-11' }).success).toBe(true)
  })

  it('projectId / positionId must be uuids', () => {
    expect(workloadQuerySchema.safeParse({ projectId: 'x' }).success).toBe(false)
    expect(workloadQuerySchema.safeParse({ positionId: 'x' }).success).toBe(false)
    const id = '5b1c2c38-5a8e-4a6c-9a0e-00000000a001'
    expect(workloadQuerySchema.parse({ projectId: id, positionId: id })).toEqual({
      projectId: id,
      positionId: id,
      onlyOver: false,
    })
  })

  it('onlyOver=1 → true, =0 → false, =yes → error', () => {
    expect(workloadQuerySchema.parse({ onlyOver: '1' }).onlyOver).toBe(true)
    expect(workloadQuerySchema.parse({ onlyOver: '0' }).onlyOver).toBe(false)
    expect(workloadQuerySchema.safeParse({ onlyOver: 'yes' }).success).toBe(false)
  })
})

describe('workloadCellQuerySchema (GET /api/workload/cell, M9-D9)', () => {
  it('{ userId, Monday } ok; a Tuesday → weekNotMonday; missing userId → error', () => {
    expect(workloadCellQuerySchema.parse({ userId: 'u', week: '2026-10-05' })).toEqual({
      userId: 'u',
      week: '2026-10-05',
    })
    expect(messages(workloadCellQuerySchema.safeParse({ userId: 'u', week: '2026-10-06' }))).toContain(
      th.grid.errors.weekNotMonday,
    )
    expect(workloadCellQuerySchema.safeParse({ week: '2026-10-05' }).success).toBe(false)
  })
})

describe('personTimeOffQuerySchema (M9-D16)', () => {
  it('takes no parameters (fixed window)', () => {
    expect(personTimeOffQuerySchema.parse({})).toEqual({})
  })
})
