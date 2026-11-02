import { describe, expect, it } from 'vitest'
import { addWeeks } from '@/domain/dates'
import { buildColumns } from './columns'
import { initialColumnLeft, initialHoldStep } from './initial-scroll'

const weeks = (from: string, n: number) => Array.from({ length: n }, (_, i) => addWeeks(from, i))

describe('initialColumnLeft (SPEC §7: the grid opens with this week in view)', () => {
  it('week zoom: the column offset of W:<week>', () => {
    const cols = buildColumns(weeks('2023-10-30', 313), new Set(), new Map())
    const r = initialColumnLeft(cols, 'W:2026-10-05', 1_000_000, 1000)
    expect(r?.index).toBe(153)
    expect(r?.left).toBe(cols[153]!.offset)
    expect(r!.left).toBeGreaterThan(0)
  })
  it('day zoom: found by key, so new day columns before it (weekends, loaded chunks) move the target with it', () => {
    const ws = weeks('2023-10-30', 313)
    const before = buildColumns(ws, new Set(ws), new Map())
    const after = buildColumns(
      ws,
      new Set(ws),
      new Map([
        ['2026-09-28', ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']],
      ]),
    )
    const a = initialColumnLeft(before, 'D:2026-10-05', 1e7, 1000)!
    const b = initialColumnLeft(after, 'D:2026-10-05', 1e7, 1000)!
    expect(b.index).toBe(a.index + 1)
    expect(b.left).toBeGreaterThan(a.left)
  })
  it('clamped to the scroll range; unknown key → null', () => {
    const cols = buildColumns(weeks('2026-01-05', 20), new Set(), new Map())
    expect(initialColumnLeft(cols, 'W:2026-05-18', 1500, 1000)?.left).toBe(500)
    expect(initialColumnLeft(cols, 'W:2030-01-07', 1500, 1000)).toBeNull()
  })
})

describe('initialHoldStep', () => {
  it('a lost first scroll (still 0) or a drop back to the timeline start is corrected', () => {
    expect(initialHoldStep({ left: 0, seen: 0, want: 9792 })).toBe('correct')
    expect(initialHoldStep({ left: 0, seen: 9792, want: 9792 })).toBe('correct')
  })
  it('the target moved (day columns arrived) while nobody scrolled → corrected', () => {
    expect(initialHoldStep({ left: 9792, seen: 9792, want: 9836 })).toBe('correct')
  })
  it('at the target → keep; unknown target → keep', () => {
    expect(initialHoldStep({ left: 9792, seen: 9792, want: 9792 })).toBe('keep')
    expect(initialHoldStep({ left: 9792.5, seen: 9792, want: 9792 })).toBe('keep')
    expect(initialHoldStep({ left: 0, seen: 0, want: null })).toBe('keep')
  })
  it('someone else scrolled somewhere else → release (never fights the user or a restore)', () => {
    expect(initialHoldStep({ left: 12_000, seen: 9792, want: 9792 })).toBe('release')
    expect(initialHoldStep({ left: 640, seen: 0, want: 9792 })).toBe('release')
  })
})
