// plan/m07 S3.8 — BR-24 conflicts found in the client cache (M7-D4, M7-D5).
import { describe, expect, it } from 'vitest'
import type { DayCtx } from '@/domain/allocation'
import { findDayWeekConflicts, previewChoice, splitByConflicts } from './br24'
import { mergeChunks } from './merge'
import { gridResponse } from './fixtures.test.data'
import type { CellWrite } from './queue'

const days = { '2026-09-28': 50, '2026-09-29': 50, '2026-09-30': 100, '2026-10-01': 50, '2026-10-02': 50 }
const model = mergeChunks([
  gridResponse({
    from: '2026-09-28',
    tasks: [
      {
        id: 't-uat',
        name: 'UAT',
        assignees: [{ taId: 'a-ivy', userId: 'ivy', cells: { '2026-09-28': { days }, '2026-10-05': 250 } }],
      },
    ],
    people: { ivy: { name: 'Ivy' } },
  }),
])!

const wk = (cd: number | null, period = '2026-09-28'): CellWrite => ({
  taskAssignmentId: 'a-ivy',
  granularity: 'WEEK',
  period,
  cd,
})
const ctx: DayCtx = {
  week: '2026-09-28',
  dayCaps: [100, 100, 100, 100, 100, 0, 0],
  schedule: [100, 100, 100, 100, 100, 0, 0],
  timeOff: [false, false, false, false, false, false, false],
}

describe('findDayWeekConflicts', () => {
  it('DAY 09-28 [50,50,100,50,50] + WEEK 200 → one pair 300 → 200', () => {
    expect(findDayWeekConflicts([wk(200)], model)).toEqual([
      {
        taskAssignmentId: 'a-ivy',
        week: '2026-09-28',
        fromCd: 300,
        toCd: 200,
        days: [50, 50, 100, 50, 50, 0, 0],
        userId: 'ivy',
      },
    ])
  })
  it('equal to Σ days, null (delete) or a WEEK week → no conflict (M7-D5)', () => {
    expect(findDayWeekConflicts([wk(300)], model)).toEqual([])
    expect(findDayWeekConflicts([wk(null)], model)).toEqual([])
    expect(findDayWeekConflicts([wk(400, '2026-10-05')], model)).toEqual([])
  })
  it('DAY writes are never conflicts; the last WEEK write of a week wins', () => {
    const dayWrite: CellWrite = { taskAssignmentId: 'a-ivy', granularity: 'DAY', period: '2026-09-29', cd: 100 }
    expect(findDayWeekConflicts([dayWrite], model)).toEqual([])
    expect(findDayWeekConflicts([wk(200), wk(300)], model)).toEqual([])
  })
})

describe('previewChoice', () => {
  const pair = findDayWeekConflicts([wk(200)], model)[0]!
  it('SCALE 200 → [34,33,67,33,33]', () => {
    const r = previewChoice(pair, ctx, 'SCALE')
    expect(r).toMatchObject({ ok: true, days: [34, 33, 67, 33, 33, 0, 0], spilled: false })
  })
  it('SCALE 400 → [100,67,100,67,66] + spilled', () => {
    const r = previewChoice({ ...pair, toCd: 400 }, ctx, 'SCALE')
    expect(r).toMatchObject({ ok: true, days: [100, 67, 100, 67, 66, 0, 0], spilled: true })
  })
  it('COLLAPSE → WEEK toCd', () => {
    expect(previewChoice(pair, ctx, 'COLLAPSE')).toEqual({ ok: true, weekCd: 200 })
  })
})

describe('splitByConflicts', () => {
  it('separates the conflicting (assignment, week) writes', () => {
    const writes = [wk(200), wk(400, '2026-10-05')]
    const pairs = findDayWeekConflicts(writes, model)
    expect(splitByConflicts(writes, pairs)).toEqual({ plain: [wk(400, '2026-10-05')], conflicting: [wk(200)] })
  })
})
