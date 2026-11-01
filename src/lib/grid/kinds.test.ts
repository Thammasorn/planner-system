// plan/m07 S3.7 — same-kind column rules for paste / fill / range typing / shift (§4.8 การกรอก, M7-D12, X65).
import { describe, expect, it } from 'vitest'
import { buildColumns } from './columns'
import { canShift, clipTargets, fillRun, sameKindRun } from './kinds'

// [W 09-21, D×5 09-28, W 09-28 (รวม), W 10-05]
const cols = buildColumns(['2026-09-21', '2026-09-28', '2026-10-05'], new Set(['2026-09-28']), new Map())
const idx = (key: string) => cols.findIndex((c) => c.key === key)

describe('sameKindRun', () => {
  it('3 values anchored at D:2026-10-01 → Thu, Fri; clipped (รวม not written)', () => {
    const a = idx('D:2026-10-01')
    expect(sameKindRun(cols, a, a + 2)).toEqual({ from: a, to: a + 1, clipped: true })
  })
  it('2 values anchored at W:2026-09-21 → only W:09-21, clipped', () => {
    expect(sameKindRun(cols, 0, 1)).toEqual({ from: 0, to: 0, clipped: true })
  })
  it('a run inside one kind is not clipped; past the grid edge is not a kind change', () => {
    expect(sameKindRun(cols, 1, 3)).toEqual({ from: 1, to: 3, clipped: false })
    expect(sameKindRun(cols, 6, 9)).toEqual({ from: 6, to: 7, clipped: false })
  })
  it('leftwards (toIdx < fromIdx)', () => {
    expect(sameKindRun(cols, 2, 0)).toEqual({ from: 1, to: 2, clipped: true })
  })
})

describe('canShift', () => {
  it('right of D:10-01..10-02 → false (destination is W)', () => {
    expect(canShift(cols, { from: idx('D:2026-10-01'), to: idx('D:2026-10-02') }, 1)).toBe(false)
  })
  it('right of D:09-29..09-30 → true', () => {
    expect(canShift(cols, { from: idx('D:2026-09-29'), to: idx('D:2026-09-30') }, 1)).toBe(true)
  })
  it('W columns shift over W (รวม → next week)', () => {
    expect(canShift(cols, { from: idx('W:2026-09-28'), to: idx('W:2026-09-28') }, 1)).toBe(true)
    expect(canShift(cols, { from: 0, to: 0 }, 1)).toBe(false)
  })
  it('the timeline edge is left to the planner', () => {
    expect(canShift(cols, { from: 0, to: 0 }, -1)).toBe(true)
  })
  it('two D weeks side by side never mix (different weekStart)', () => {
    const two = buildColumns(['2026-09-28', '2026-10-05'], new Set(['2026-09-28', '2026-10-05']), new Map())
    // fake adjacency: drop the รวม column between the two weeks
    const noTotal = two.filter((c) => !(c.role === 'weekTotal' && c.weekStart === '2026-09-28'))
    expect(canShift(noTotal, { from: 4, to: 4 }, 1)).toBe(false)
  })
})

describe('fillRun', () => {
  it('fill from W:2026-09-28 (รวม) → W:10-05 allowed (both W)', () => {
    const s = idx('W:2026-09-28')
    expect(fillRun(cols, { c0: s, c1: s }, { c0: s + 1, c1: s + 1 })).toEqual({ from: s + 1, to: s + 1, clipped: false })
  })
  it('fill from D:10-02 into รวม → nothing, clipped', () => {
    const s = idx('D:2026-10-02')
    expect(fillRun(cols, { c0: s, c1: s }, { c0: s + 1, c1: s + 2 })).toEqual({ from: s + 1, to: s, clipped: true })
  })
  it('leftwards from D:09-29 into Mon then W:09-21 → only Mon', () => {
    const s = idx('D:2026-09-29')
    expect(fillRun(cols, { c0: s, c1: s }, { c0: 0, c1: s - 1 })).toEqual({ from: s - 1, to: s - 1, clipped: true })
  })
})

describe('clipTargets', () => {
  it('returns null outside [from, to]', () => {
    const at = clipTargets((r, c) => ({ r, c }), { from: 2, to: 3 })
    expect(at(0, 1)).toBeNull()
    expect(at(0, 2)).toEqual({ r: 0, c: 2 })
    expect(at(0, 4)).toBeNull()
  })
})
