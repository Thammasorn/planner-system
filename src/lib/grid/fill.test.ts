import { describe, expect, it } from 'vitest'
import { planFill } from './fill'
import { fakeGrid } from './grid.test.helper'

describe('planFill (§4.8 fill handle)', () => {
  it('source [300, 500] dragged right 4 columns → 300, 500, 300, 500', () => {
    const g = fakeGrid([{ id: 'cindy', values: [300, 500, 0, 0, 0, 0] }])
    const r = planFill({ r0: 0, c0: 0, r1: 0, c1: 1 }, { r0: 0, c0: 2, r1: 0, c1: 5 }, g.at)
    expect(r.writes.map((w) => w.cd)).toEqual([300, 500, 300, 500])
  })
  it('vertical drag over a parent row skips that row', () => {
    const g = fakeGrid([
      { id: 'cindy', values: [300] },
      { id: 'parent', values: [0], editability: 'readOnlyRow' },
      { id: 'ivy', values: [0] },
    ])
    const r = planFill({ r0: 0, c0: 0, r1: 0, c1: 0 }, { r0: 1, c0: 0, r1: 2, c1: 0 }, g.at)
    expect(r.writes).toEqual([
      { taskAssignmentId: 'ivy', granularity: 'WEEK', period: '2026-11-09', cd: 300 },
    ])
    expect(r.skippedReadOnly).toBe(1)
  })
  it('copies empties as clears and leaves equal values alone', () => {
    const g = fakeGrid([{ id: 'cindy', values: [0, 100, 0] }])
    const r = planFill({ r0: 0, c0: 0, r1: 0, c1: 0 }, { r0: 0, c0: 1, r1: 0, c1: 2 }, g.at)
    expect(r.writes.map((w) => w.cd)).toEqual([null])
  })
  it('tiles backwards (dragging left / up)', () => {
    const g = fakeGrid([{ id: 'cindy', values: [0, 0, 0, 100, 200] }])
    const r = planFill({ r0: 0, c0: 3, r1: 0, c1: 4 }, { r0: 0, c0: 0, r1: 0, c1: 2 }, g.at)
    expect(r.writes.map((w) => w.cd)).toEqual([200, 100, 200])
  })
})
