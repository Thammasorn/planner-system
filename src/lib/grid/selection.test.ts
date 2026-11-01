import { describe, expect, it } from 'vitest'
import { cellsOf, clampPos, fillTargetRect, inRect, movePos, rectOf, rectSize } from './selection'

describe('selection math', () => {
  it('normalises and measures rects', () => {
    const r = rectOf({ r: 3, c: 9 }, { r: 1, c: 4 })
    expect(r).toEqual({ r0: 1, c0: 4, r1: 3, c1: 9 })
    expect(rectSize(r)).toEqual({ rows: 3, cols: 6 })
    expect(inRect(r, 2, 5)).toBe(true)
    expect(inRect(r, 0, 5)).toBe(false)
    expect(inRect(null, 0, 0)).toBe(false)
  })
  it('moves and clamps', () => {
    expect(movePos({ r: 0, c: 0 }, -1, -1, 5, 5)).toEqual({ r: 0, c: 0 })
    expect(movePos({ r: 4, c: 4 }, 1, 1, 5, 5)).toEqual({ r: 4, c: 4 })
    expect(clampPos({ r: 9, c: -3 }, 5, 5)).toEqual({ r: 4, c: 0 })
  })
  it('cellsOf walks row-major', () => {
    expect(cellsOf({ r0: 0, c0: 0, r1: 1, c1: 1 }, (r, c) => `${r}${c}`)).toEqual([
      ['00', '01'],
      ['10', '11'],
    ])
  })
  it('fill target follows the dominant axis and excludes the source', () => {
    const src = { r0: 2, c0: 2, r1: 2, c1: 3 }
    expect(fillTargetRect(src, { r: 2, c: 7 })).toEqual({ r0: 2, r1: 2, c0: 4, c1: 7 })
    expect(fillTargetRect(src, { r: 5, c: 4 })).toEqual({ r0: 3, r1: 5, c0: 2, c1: 3 })
    expect(fillTargetRect(src, { r: 2, c: 0 })).toEqual({ r0: 2, r1: 2, c0: 0, c1: 1 })
    expect(fillTargetRect(src, { r: 2, c: 3 })).toBeNull()
  })
})
