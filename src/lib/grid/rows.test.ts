import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { daysOfWeek } from '@/domain/dates'
import type { LoadView, PeriodKey } from '@/domain/types'
import type { GridTaskRow } from '@/lib/contracts/grid'
import { gridResponse, posChunks, POS_PEOPLE, POS_TASKS, type FxTask } from './fixtures.test.data'
import { mergeChunks } from './merge'
import {
  buildViewRows,
  cellEditability,
  cellRowOf,
  sumPeopleCount,
  rowKeyOfAssignment,
  rowKeyOfTask,
  sumCell,
  sumWriteTarget,
  type GridViewRow,
} from './rows'
import { recomputeTotals } from './totals'

const open = { showCompleted: true, collapsed: new Set<string>() }

const TREE: FxTask[] = [
  { id: 'parent', name: 'แม่', assignees: [] },
  {
    id: 'child-a',
    name: 'ลูก A',
    parentId: 'parent',
    depth: 1,
    assignees: [{ taId: 'a-ca', userId: 'cindy', cells: { '2026-09-28': 100 } }],
  },
  { id: 'child-b', name: 'ลูก B', parentId: 'parent', depth: 1, assignees: [] },
  {
    id: 'pair',
    name: 'คู่',
    assignees: [
      { taId: 'a-jack', userId: 'jack', cells: { '2026-09-28': 300 } },
      {
        taId: 'a-mix',
        userId: 'mint',
        cells: { '2026-10-12': { days: { '2026-10-12': 50, '2026-10-13': 50 } } },
      },
    ],
  },
  {
    id: 'done',
    name: 'เสร็จแล้ว',
    completedWeek: '2026-09-28',
    assignees: [{ taId: 'a-done', userId: 'ivy', cells: { '2026-09-28': 100 } }],
  },
]
const people = { ...POS_PEOPLE, jack: { name: 'Jack' } }
const model = (o: { archived?: boolean; canEdit?: boolean } = {}) =>
  mergeChunks([gridResponse({ from: '2026-09-28', tasks: TREE, people, ...o })])!

describe('row keys (M6-D33)', () => {
  it('prefixes task and assignment ids', () => {
    expect(rowKeyOfTask('x')).toBe('t:x')
    expect(rowKeyOfAssignment('y')).toBe('a:y')
  })
})

describe('buildViewRows (FR-805, §8.3)', () => {
  it('merges single-assignee leaves: golden POS → 3 merged rows keyed a:<id>', () => {
    const rows = buildViewRows(mergeChunks(posChunks())!, open)
    expect(rows.map((r) => [r.kind, r.key])).toEqual([
      ['merged', 'a:a-cindy-pos'],
      ['merged', 'a:a-ivy-uat'],
      ['merged', 'a:a-mix-rollout'],
    ])
  })

  it('a task with two assignees → t: row + two a: rows; parents and unassigned leaves → t: rows', () => {
    const rows = buildViewRows(model(), open)
    expect(rows.map((r) => `${r.kind}:${r.key}:${r.depth}`)).toEqual([
      'task:t:parent:0',
      'merged:a:a-ca:1',
      'task:t:child-b:1',
      'task:t:pair:0',
      'assignee:a:a-jack:1',
      'assignee:a:a-mix:1',
      'merged:a:a-done:0',
    ])
  })

  it('hides completed tasks when showCompleted is false', () => {
    const rows = buildViewRows(model(), { showCompleted: false, collapsed: new Set() })
    expect(rows.some((r) => r.task.id === 'done')).toBe(false)
  })

  it('keeps a completed parent visible while a child is open', () => {
    const tree: FxTask[] = [
      { id: 'p', name: 'p', completedWeek: '2026-09-28', assignees: [] },
      { id: 'c', name: 'c', parentId: 'p', depth: 1, assignees: [] },
    ]
    const m = mergeChunks([gridResponse({ from: '2026-09-28', tasks: tree, people })])!
    expect(buildViewRows(m, { showCompleted: false, collapsed: new Set() }).map((r) => r.key)).toEqual([
      't:p',
      't:c',
    ])
  })

  it('collapsed parents hide their descendants', () => {
    const rows = buildViewRows(model(), { showCompleted: true, collapsed: new Set(['parent']) })
    expect(rows.map((r) => r.key).slice(0, 2)).toEqual(['t:parent', 't:pair'])
    expect(rows[0]?.kind === 'task' && rows[0].collapsed).toBe(true)
  })
})

describe('cellEditability (M6-D11)', () => {
  const m = model()
  const rows = buildViewRows(m, open)
  const byKey = (k: string) => rows.find((r) => r.key === k)!
  const cellOf = (k: string, p: `W:${string}`) => m.cells.get(k)?.get(p)

  it('ok on merged and assignee rows', () => {
    expect(cellEditability(byKey('a:a-ca'), cellOf('a:a-ca', 'W:2026-09-28'), m)).toBe('ok')
    expect(cellEditability(byKey('a:a-jack'), undefined, m)).toBe('ok')
  })
  it('parent and multi-assignee task rows are read-only sums', () => {
    expect(cellEditability(byKey('t:parent'), undefined, m)).toBe('readOnlyRow')
    expect(cellEditability(byKey('t:pair'), undefined, m)).toBe('readOnlyRow')
  })
  it('unassigned leaf → unassigned', () => {
    expect(cellEditability(byKey('t:child-b'), undefined, m)).toBe('unassigned')
  })
  it('DAY week → ok (M7, X27: DAY weeks are editable)', () => {
    expect(cellEditability(byKey('a:a-mix'), cellOf('a:a-mix', 'W:2026-10-12'), m)).toBe('ok')
  })
  it('archived project → archived; canEdit false → noEdit', () => {
    const am = model({ archived: true })
    const ar = buildViewRows(am, open)
    expect(
      cellEditability(
        ar.find((r) => r.key === 'a:a-ca')!,
        undefined,
        am,
      ),
    ).toBe('archived')
    const nm = model({ canEdit: false })
    const nr = buildViewRows(nm, open)
    expect(
      cellEditability(
        nr.find((r) => r.key === 'a:a-ca')!,
        undefined,
        nm,
      ),
    ).toBe('noEdit')
  })
  it('completed and deactivated rows stay editable', () => {
    expect(cellEditability(byKey('a:a-done'), undefined, m)).toBe('ok')
  })
})

// ── M7.1: hidden assignee column (FR-816/817, BR-100/101, M7.1-D6) ──

const hidden = { showCompleted: true, collapsed: new Set<string>(), showAssignees: false }
/** POS with Jack added to "ทำ UAT + คู่มือหน้าร้าน" (1.0 at 28/9, AC-810). */
const POS_JACK: FxTask[] = POS_TASKS.map((t) =>
  t.id === 't-uat'
    ? { ...t, assignees: [...t.assignees, { taId: 'a-jack-uat', userId: 'jack', cells: { '2026-09-28': 100 } }] }
    : t,
)
const posJack = () =>
  mergeChunks([gridResponse({ from: '2026-08-31', tasks: POS_JACK, people: { ...POS_PEOPLE, jack: { name: 'Jack' } } })])!

describe('buildViewRows showAssignees (FR-816)', () => {
  it('showAssignees true (and the default) → M6 output unchanged', () => {
    const m = model()
    expect(buildViewRows(m, { ...open, showAssignees: true })).toEqual(buildViewRows(m, open))
  })
  it('hidden: the 3 POS tasks = 3 sum rows keyed t:<id>', () => {
    const rows = buildViewRows(mergeChunks(posChunks())!, hidden)
    expect(rows.map((r) => [r.kind, r.key])).toEqual([
      ['sum', 't:t-pos'],
      ['sum', 't:t-uat'],
      ['sum', 't:t-rollout'],
    ])
  })
  it('hidden: one row per visible task with its assignees, depth and collapsed flag', () => {
    const rows = buildViewRows(model(), { ...hidden, collapsed: new Set(['parent']) })
    expect(rows.map((r) => `${r.kind}:${r.key}:${r.depth}`)).toEqual(['sum:t:parent:0', 'sum:t:pair:0', 'sum:t:done:0'])
    const parent = rows[0]!
    const pair = rows[1]!
    expect(parent.kind === 'sum' && parent.collapsed).toBe(true)
    expect(parent.kind === 'sum' && parent.assignees).toEqual([])
    expect(pair.kind === 'sum' && pair.assignees.map((a) => a.taskAssignmentId)).toEqual(['a-jack', 'a-mix'])
  })
  it('hidden still respects showCompleted', () => {
    const rows = buildViewRows(model(), { ...hidden, showCompleted: false })
    expect(rows.some((r) => r.task.id === 'done')).toBe(false)
  })
})

describe('sumCell (BR-100)', () => {
  it('"ทำ UAT" with Ivy + Jack → Σ = 350 at W:2026-09-28; one assignee = its value', () => {
    const rows = buildViewRows(posJack(), hidden)
    const uat = rows.find((r) => r.task.id === 't-uat')!
    expect(sumCell(uat, 'W:2026-09-28', 'ALL')).toBe(350)
    expect(sumCell(uat, 'W:2026-10-05', 'ALL')).toBe(125)
    expect(sumCell(uat, 'W:2026-11-30', 'ALL')).toBe(0)
  })
  it('view-aware (BR-37): tentative Rollout counts only in ALL / AT_RISK', () => {
    const rows = buildViewRows(mergeChunks(posChunks())!, hidden)
    const r = rows.find((x) => x.task.id === 't-rollout')!
    expect(sumCell(r, 'W:2026-12-07', 'ALL')).toBe(375)
    expect(sumCell(r, 'W:2026-12-07', 'COMMITTED')).toBe(0)
    expect(sumCell(r, 'W:2026-12-07', 'AT_RISK')).toBe(375)
  })
  it('parent = Σ leaves', () => {
    const rows = buildViewRows(model(), hidden)
    expect(sumCell(rows.find((r) => r.key === 't:parent')!, 'W:2026-09-28', 'ALL')).toBe(100)
  })

  it('property: Σ over the day columns of sumCell = sumCell of the week, every view (BR-100)', () => {
    const W = '2026-09-28'
    const days = daysOfWeek(W)
    const cell = fc.oneof(
      fc.integer({ min: 0, max: 500 }),
      fc
        .array(fc.integer({ min: 0, max: 100 }), { minLength: 5, maxLength: 5 })
        .map((v) => ({ days: Object.fromEntries(v.map((cd, i) => [days[i]!, cd])) })),
    )
    const people = ['cindy', 'ivy', 'mint', 'jack']
    const arb = fc.record({
      leaves: fc.array(
        fc.record({
          tentative: fc.boolean(),
          assignees: fc.uniqueArray(fc.constantFrom(...people), { maxLength: 4 }),
          cells: fc.array(cell, { minLength: 4, maxLength: 4 }),
        }),
        { minLength: 1, maxLength: 4 },
      ),
      nest: fc.boolean(),
      view: fc.constantFrom<LoadView>('ALL', 'COMMITTED', 'AT_RISK'),
    })
    fc.assert(
      fc.property(arb, ({ leaves, nest, view }) => {
        const tasks: FxTask[] = nest ? [{ id: 'root', name: 'root', assignees: [] }] : []
        leaves.forEach((l, i) =>
          tasks.push({
            id: `t${i}`,
            name: `t${i}`,
            parentId: nest ? 'root' : null,
            depth: nest ? 1 : 0,
            certainty: l.tentative ? 'TENTATIVE' : 'CONFIRMED',
            assignees: l.assignees.map((u, k) => ({ taId: `a${i}-${u}`, userId: u, cells: { [W]: l.cells[k]! } })),
          }),
        )
        const resp = gridResponse({
          from: W,
          weeks: 1,
          tasks,
          people: { ...POS_PEOPLE, jack: { name: 'Jack' } },
          expand: [W],
        })
        const keys = new Set<PeriodKey>([`W:${W}`, ...days.map((d): PeriodKey => `D:${d}`)])
        recomputeTotals(
          resp.rows,
          new Set(resp.rows.filter((r): r is GridTaskRow => r.kind === 'task').map((t) => t.id)),
          keys,
        )
        const rows = buildViewRows(mergeChunks([resp])!, hidden)
        for (const r of rows) {
          const daySum = days.reduce((a, d) => a + sumCell(r, `D:${d}`, view), 0)
          expect(daySum).toBe(sumCell(r, `W:${W}`, view))
        }
      }),
      { numRuns: 150 },
    )
  })
})

describe('sumWriteTarget / cellEditability sum (BR-101, FR-817)', () => {
  const m = posJack()
  const rows = buildViewRows(m, hidden)
  const of = (id: string) => rows.find((r) => r.task.id === id)!

  it('leaf with exactly one assignee → that assignment, editable', () => {
    expect(sumWriteTarget(of('t-pos'))?.taskAssignmentId).toBe('a-cindy-pos')
    expect(cellEditability(of('t-pos'), undefined, m)).toBe('ok')
  })
  it('"ทำ UAT" with Ivy + Jack → readOnlySum, no target (never distribute)', () => {
    expect(sumWriteTarget(of('t-uat'))).toBeNull()
    expect(cellEditability(of('t-uat'), undefined, m)).toBe('readOnlySum')
  })
  it('parent rows → readOnlySum; unassigned leaf → unassigned', () => {
    const tm = model()
    const tr = buildViewRows(tm, hidden)
    const parent = tr.find((r) => r.key === 't:parent')!
    expect(sumWriteTarget(parent)).toBeNull()
    expect(cellEditability(parent, undefined, tm)).toBe('readOnlySum')
    const sub = buildViewRows(tm, { ...hidden, collapsed: new Set() }).find((r) => r.key === 't:child-b')!
    expect(cellEditability(sub, undefined, tm)).toBe('unassigned')
  })
  it('archived / noEdit precedence unchanged; target not editable → noEdit', () => {
    const am = mergeChunks(posChunks({ archived: true }))!
    expect(cellEditability(buildViewRows(am, hidden)[0]!, undefined, am)).toBe('archived')
    const nm = mergeChunks([gridResponse({ from: '2026-08-31', tasks: POS_TASKS, people: POS_PEOPLE, canEdit: false })])!
    expect(cellEditability(buildViewRows(nm, hidden)[0]!, undefined, nm)).toBe('noEdit')
    const row = of('t-pos')
    if (row.kind !== 'sum') throw new Error('expected a sum row')
    const locked: GridViewRow = { ...row, assignees: [{ ...row.assignees[0]!, editable: false }] }
    expect(cellEditability(locked, undefined, m)).toBe('noEdit')
  })
  it('merged and assignee rows resolve to their own assignment; task rows → null', () => {
    const shown = buildViewRows(model(), open)
    expect(sumWriteTarget(shown.find((r) => r.key === 'a:a-ca')!)?.taskAssignmentId).toBe('a-ca')
    expect(sumWriteTarget(shown.find((r) => r.key === 'a:a-jack')!)?.taskAssignmentId).toBe('a-jack')
    expect(sumWriteTarget(shown.find((r) => r.key === 't:pair')!)).toBeNull()
  })
})

describe('cellRowOf / sumPeopleCount (M7.1-D6, S3.3)', () => {
  const m = posJack()
  const rows = buildViewRows(m, hidden)
  const of = (id: string) => rows.find((r) => r.task.id === id)!

  it('a single-assignee sum row shows (and writes) that assignment like a merged row', () => {
    expect(cellRowOf(of('t-pos'))).toMatchObject({ kind: 'merged', key: 'a:a-cindy-pos', depth: 0 })
    expect(cellEditability(cellRowOf(of('t-pos')), undefined, m)).toBe('ok')
  })
  it('a multi-assignee / parent sum row shows its task totals like a task row', () => {
    expect(cellRowOf(of('t-uat'))).toMatchObject({ kind: 'task', key: 't:t-uat' })
    const tm = model()
    const parent = buildViewRows(tm, hidden).find((r) => r.key === 't:parent')!
    expect(cellRowOf(parent)).toMatchObject({ kind: 'task', key: 't:parent', collapsed: false })
  })
  it('M6 rows are returned unchanged', () => {
    for (const r of buildViewRows(model(), open)) expect(cellRowOf(r)).toBe(r)
  })
  it('"👥 N" only on summed leaves with two or more people', () => {
    expect(sumPeopleCount(of('t-uat'))).toBe(2)
    expect(sumPeopleCount(of('t-pos'))).toBeNull()
    const tm = model()
    expect(sumPeopleCount(buildViewRows(tm, hidden).find((r) => r.key === 't:parent')!)).toBeNull()
    expect(sumPeopleCount(buildViewRows(tm, open).find((r) => r.key === 't:pair')!)).toBeNull()
  })
})
