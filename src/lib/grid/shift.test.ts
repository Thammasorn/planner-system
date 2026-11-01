import { describe, expect, it } from 'vitest'
import { fakeGrid } from './grid.test.helper'
import { planShift } from './shift'

describe('planShift (§4.8 Cmd+←/→)', () => {
  it('[a, b, ∅] right → [∅, a, b], selection +1', () => {
    const g = fakeGrid([{ id: 'cindy', values: [300, 500, 0] }])
    const r = planShift({ r0: 0, c0: 0, r1: 0, c1: 1 }, 1, g.at)
    expect('blocked' in r).toBe(false)
    if ('blocked' in r) return
    expect(r.writes.map((w) => [w.period, w.cd])).toEqual([
      ['2026-11-09', null],
      ['2026-11-16', 300],
      ['2026-11-23', 500],
    ])
    expect(r.newRect).toEqual({ r0: 0, c0: 1, r1: 0, c1: 2 })
  })
  it('left moves values back', () => {
    const g = fakeGrid([{ id: 'cindy', values: [0, 300, 500] }])
    const r = planShift({ r0: 0, c0: 1, r1: 0, c1: 2 }, -1, g.at)
    if ('blocked' in r) throw new Error('blocked')
    expect(r.writes.map((w) => [w.period, w.cd])).toEqual([
      ['2026-11-09', 300],
      ['2026-11-16', 500],
      ['2026-11-23', null],
    ])
  })
  it('left at the timeline edge → blocked', () => {
    const g = fakeGrid([{ id: 'cindy', values: [300, 500] }])
    expect(planShift({ r0: 0, c0: 0, r1: 0, c1: 1 }, -1, g.at)).toEqual({ blocked: true })
  })
  it('M7 (X27): a DAY week in the destination is overwritten (its WEEK write goes through BR-24)', () => {
    const g = fakeGrid([{ id: 'cindy', values: [300, 0, 200], day: [false, false, true] }])
    const r = planShift({ r0: 0, c0: 0, r1: 0, c1: 1 }, 1, g.at)
    if ('blocked' in r) throw new Error('blocked')
    expect(r.writes.map((w) => [w.period, w.cd])).toEqual([
      ['2026-11-09', null],
      ['2026-11-16', 300],
      ['2026-11-23', null],
    ])
  })
  it('a read-only row in the rect → blocked', () => {
    const g = fakeGrid([
      { id: 'cindy', values: [300, 0] },
      { id: 'p', values: [0, 0], editability: 'readOnlyRow' },
    ])
    expect(planShift({ r0: 0, c0: 0, r1: 1, c1: 0 }, 1, g.at)).toEqual({ blocked: true })
  })
})
