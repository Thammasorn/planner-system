import { describe, expect, it } from 'vitest'
import { fakeGrid } from './grid.test.helper'
import { planPaste } from './paste'
import { parseTsv } from './tsv'

const empty = (id: string, n = 4) => ({ id, values: Array.from({ length: n }, () => 0) })

describe('planPaste (AC-803, M6-D28)', () => {
  it('2×4 fraction block into Cindy / Ivy POS 11-09…11-30', () => {
    const g = fakeGrid([empty('cindy'), empty('ivy')])
    const block = parseTsv('0.5\t1\t0.75\t0.25\r\n1\t0.5\t0.25\t0.75\r\n')
    const r = planPaste(block, { row: 0, col: 0 }, { rows: 1, cols: 1 }, g.at, 'FRACTION')
    expect(r.pasted).toBe(8)
    const byRow = (id: string) => r.writes.filter((w) => w.taskAssignmentId === id).map((w) => w.cd)
    expect(byRow('cindy')).toEqual([250, 500, 375, 125])
    expect(byRow('ivy')).toEqual([500, 250, 125, 375])
    expect(r.writes.filter((w) => w.taskAssignmentId === 'cindy').map((w) => w.period)).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ])
  })
  it('a 1×2 block into a 2×4 selection is tiled (8 writes)', () => {
    const g = fakeGrid([empty('cindy'), empty('ivy')])
    const r = planPaste([['1', '2']], { row: 0, col: 0 }, { rows: 2, cols: 4 }, g.at, 'DAYS')
    expect(r.writes.map((w) => w.cd)).toEqual([100, 200, 100, 200, 100, 200, 100, 200])
  })
  it('a 2×3 block into a 2×4 selection is pasted once (6)', () => {
    const g = fakeGrid([empty('cindy'), empty('ivy')])
    const r = planPaste(
      [
        ['1', '1', '1'],
        ['2', '2', '2'],
      ],
      { row: 0, col: 0 },
      { rows: 2, cols: 4 },
      g.at,
      'DAYS',
    )
    expect(r.pasted).toBe(6)
  })
  it('M7 (X27): a DAY-week target is written (BR-24 flow); a read-only target is skipped, never shifting', () => {
    const g = fakeGrid([{ id: 'cindy', values: [0, 200, 0], day: [false, true, false] }])
    const all = planPaste([['1', '2', '3']], { row: 0, col: 0 }, { rows: 1, cols: 1 }, g.at, 'DAYS')
    expect(all.writes.map((w) => [w.period, w.cd])).toEqual([
      ['2026-11-09', 100],
      ['2026-11-16', 200],
      ['2026-11-23', 300],
    ])
  })
  it('skips (and counts) a read-only target, never shifting', () => {
    const g = fakeGrid([{ id: 'cindy', values: [0, 200, 0], editability: ['ok', 'noEdit', 'ok'] }])
    const r = planPaste([['1', '2', '3']], { row: 0, col: 0 }, { rows: 1, cols: 1 }, g.at, 'DAYS')
    expect(r.writes.map((w) => [w.period, w.cd])).toEqual([
      ['2026-11-09', 100],
      ['2026-11-23', 300],
    ])
    expect(r.skippedReadOnly).toBe(1)
  })
  it("an invalid token 'x' is skipped and counted; empty tokens clear", () => {
    const g = fakeGrid([{ id: 'cindy', values: [0, 100, 0] }])
    const r = planPaste([['x', '', '1']], { row: 0, col: 0 }, { rows: 1, cols: 1 }, g.at, 'DAYS')
    expect(r.invalid).toBe(1)
    expect(r.writes.map((w) => w.cd)).toEqual([null, 100])
  })
  it('drops cells past the last row / column', () => {
    const g = fakeGrid([empty('cindy', 2)])
    const r = planPaste(
      parseTsv('1\t2\t3\r\n4\t5\t6'),
      { row: 0, col: 0 },
      { rows: 1, cols: 1 },
      g.at,
      'DAYS',
    )
    expect(r.writes).toHaveLength(2)
  })
})
