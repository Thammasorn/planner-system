import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays } from '@/domain/dates'
import { CALENDAR_MAX_LANES, monthBars, noDateTasks, taskOrder, taskSpan, type CalendarTask } from './bars'

let seq = 0
const task = (id: string, startDate: string | null, dueDate: string | null, o: Partial<CalendarTask> = {}): CalendarTask => ({
  id,
  parentId: null,
  position: `a${String(seq++).padStart(4, '0')}`,
  startDate,
  dueDate,
  completedOn: null,
  ...o,
})
const all = { showCompleted: true }

describe('taskSpan (BR-103)', () => {
  it('both dates → that range; one date → one day; none → null', () => {
    expect(taskSpan(task('a', '2026-11-03', '2026-11-12'))).toEqual({ start: '2026-11-03', end: '2026-11-12' })
    expect(taskSpan(task('a', null, '2026-11-12'))).toEqual({ start: '2026-11-12', end: '2026-11-12' })
    expect(taskSpan(task('a', '2026-11-03', null))).toEqual({ start: '2026-11-03', end: '2026-11-03' })
    expect(taskSpan(task('a', null, null))).toBeNull()
  })
  it('a due date before the start is normalised', () => {
    expect(taskSpan(task('a', '2026-11-12', '2026-11-03'))).toEqual({ start: '2026-11-03', end: '2026-11-12' })
  })
})

describe('monthBars (FR-811, BR-103)', () => {
  it('six Monday-first week rows of the month grid', () => {
    const rows = monthBars([], '2026-11', all)
    expect(rows.map((r) => r.week)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
  })
  it('3–12 Nov 2026 splits into two segments with continuation flags (AC-806)', () => {
    const rows = monthBars([task('rollout', '2026-11-03', '2026-11-12')], '2026-11', all)
    expect(rows[1]!.segments).toEqual([
      { taskId: 'rollout', startCol: 1, endCol: 6, lane: 0, continuesLeft: false, continuesRight: true },
    ])
    expect(rows[2]!.segments).toEqual([
      { taskId: 'rollout', startCol: 0, endCol: 3, lane: 0, continuesLeft: true, continuesRight: false },
    ])
    expect(rows[0]!.segments).toEqual([])
  })
  it('due-only and start-only = one day', () => {
    const rows = monthBars([task('due', null, '2026-11-12'), task('start', '2026-11-12', null)], '2026-11', all)
    expect(rows[2]!.segments.map((s) => [s.taskId, s.startCol, s.endCol, s.lane])).toEqual([
      ['due', 3, 3, 0],
      ['start', 3, 3, 1],
    ])
  })
  it('4 overlapping tasks → "+1" on the overlapped day', () => {
    const tasks = [
      task('a', '2026-11-09', '2026-11-13'),
      task('b', '2026-11-10', '2026-11-11'),
      task('c', '2026-11-11', '2026-11-11'),
      task('d', '2026-11-11', '2026-11-12'),
    ]
    const row = monthBars(tasks, '2026-11', all)[2]!
    expect(row.segments.map((s) => [s.taskId, s.lane])).toEqual([
      ['a', 0],
      ['b', 1],
      ['d', 2],
    ])
    expect([...row.overflow.entries()]).toEqual([['2026-11-11', ['c']]])
    expect(CALENDAR_MAX_LANES).toBe(3)
  })
  it('sort: start, longer first, then task order (BR-105)', () => {
    const tasks = [task('short', '2026-11-09', '2026-11-09'), task('long', '2026-11-09', '2026-11-11'), task('same', '2026-11-09', '2026-11-09')]
    const row = monthBars(tasks, '2026-11', all)[2]!
    expect(row.segments.map((s) => [s.taskId, s.lane])).toEqual([
      ['long', 0],
      ['short', 1],
      ['same', 2],
    ])
  })
  it('a task keeps its lane in every week row it spans when possible', () => {
    const tasks = [
      task('x', '2026-11-04', '2026-11-04'),
      task('long', '2026-11-05', '2026-11-18'),
      task('y', '2026-11-09', '2026-11-20'),
    ]
    const rows = monthBars(tasks, '2026-11', all)
    const lane = (w: number, id: string) => rows[w]!.segments.find((s) => s.taskId === id)!.lane
    expect([lane(1, 'long'), lane(2, 'long'), lane(3, 'long')]).toEqual([0, 0, 0])
    expect(lane(2, 'y')).toBe(1)
  })
  it('a continuing task whose lane-0 slot is taken moves to the first free lane (never overlaps)', () => {
    const tasks = [
      task('first', '2026-11-06', '2026-11-10'),
      task('blocker', '2026-11-02', '2026-11-04'),
      task('early', '2026-11-09', '2026-11-09'),
    ]
    // week 2 Nov: blocker lane 0 (cols 0-2), first lane 0 (cols 4-6); week 9 Nov: first prefers 0 and gets it
    const rows = monthBars(tasks, '2026-11', all)
    expect(rows[2]!.segments.map((s) => [s.taskId, s.lane])).toEqual([
      ['first', 0],
      ['early', 1],
    ])
    // preferred lane 1 taken by a task sorted earlier → first free lane
    const t2 = [
      task('a', '2026-11-05', '2026-11-05'),
      task('b', '2026-11-05', '2026-11-10'),
      task('c', '2026-11-09', '2026-11-09', { position: '0000' }),
    ]
    const r2 = monthBars(t2, '2026-11', all)
    expect(r2[1]!.segments.find((s) => s.taskId === 'b')!.lane).toBe(0)
    expect(r2[2]!.segments.map((s) => [s.taskId, s.lane])).toEqual([
      ['b', 0],
      ['c', 1],
    ])
  })
  it('a task spanning Oct → Dec is clipped to the visible 6-week grid', () => {
    const rows = monthBars([task('big', '2026-09-15', '2026-12-31')], '2026-11', all)
    expect(rows[0]!.segments[0]).toMatchObject({ startCol: 0, endCol: 6, continuesLeft: true, continuesRight: true })
    expect(rows[5]!.segments[0]).toMatchObject({ startCol: 0, endCol: 6, continuesLeft: true, continuesRight: true })
    expect(rows.every((r) => r.segments.length === 1)).toBe(true)
  })
  it('tasks outside the grid, without dates, or completed (switch off) are left out', () => {
    const tasks = [
      task('before', '2026-09-01', '2026-09-30'),
      task('none', null, null),
      task('done', '2026-11-10', '2026-11-10', { completedOn: '2026-11-10' }),
    ]
    expect(monthBars(tasks, '2026-11', { showCompleted: false }).flatMap((r) => r.segments)).toEqual([])
    expect(monthBars(tasks, '2026-11', all).flatMap((r) => r.segments.map((s) => s.taskId))).toEqual(['done'])
  })
  it('parents show with their own dates (not computed from children)', () => {
    const p = task('p', '2026-11-02', '2026-11-02')
    const c = task('c', '2026-11-16', '2026-11-16', { parentId: 'p' })
    const rows = monthBars([c, p], '2026-11', all)
    expect(rows[1]!.segments.map((s) => s.taskId)).toEqual(['p'])
    expect(rows[3]!.segments.map((s) => s.taskId)).toEqual(['c'])
  })
  it('an explicit order overrides the tree order', () => {
    const a = task('a', '2026-11-09', '2026-11-09')
    const b = task('b', '2026-11-09', '2026-11-09')
    const row = monthBars([a, b], '2026-11', { ...all, order: ['b', 'a'] })[2]!
    expect(row.segments.map((s) => s.taskId)).toEqual(['b', 'a'])
  })
  it('property: no two segments of one lane overlap in a week row; every segment is within 0..6', () => {
    const day = fc.integer({ min: -10, max: 50 }).map((n) => addDays('2026-10-26', n))
    const arb = fc.array(
      fc.tuple(fc.option(day, { nil: null }), fc.option(day, { nil: null })),
      { maxLength: 30 },
    )
    fc.assert(
      fc.property(arb, (pairs) => {
        const tasks = pairs.map(([s, d], i) => task(`t${i}`, s, d))
        for (const row of monthBars(tasks, '2026-11', all)) {
          for (const s of row.segments) {
            expect(s.startCol).toBeGreaterThanOrEqual(0)
            expect(s.endCol).toBeLessThanOrEqual(6)
            expect(s.startCol).toBeLessThanOrEqual(s.endCol)
            expect(s.lane).toBeLessThan(CALENDAR_MAX_LANES)
          }
          for (const a of row.segments)
            for (const b of row.segments)
              if (a !== b && a.lane === b.lane) expect(a.endCol < b.startCol || b.endCol < a.startCol).toBe(true)
        }
      }),
    )
  })
})

describe('noDateTasks / taskOrder (FR-812)', () => {
  it('tasks without both dates, in tree order', () => {
    const p = task('p', null, null)
    const c = task('c', null, null, { parentId: 'p' })
    const q = task('q', '2026-11-02', null)
    const r = task('r', null, null, { completedOn: '2026-10-01' })
    expect(noDateTasks([c, q, r, p]).map((t) => t.id)).toEqual(['p', 'c', 'r'])
    expect(noDateTasks([c, q, r, p], { showCompleted: false }).map((t) => t.id)).toEqual(['p', 'c'])
  })
  it('taskOrder = DFS by position; orphans go last', () => {
    const p = task('p', null, null)
    const c = task('c', null, null, { parentId: 'p' })
    const o = task('o', null, null, { parentId: 'missing' })
    const order = taskOrder([o, c, p])
    expect([...order.entries()]).toEqual([
      ['p', 0],
      ['c', 1],
      ['o', 2],
    ])
  })
})
