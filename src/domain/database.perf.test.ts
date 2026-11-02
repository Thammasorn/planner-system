// Domain perf smoke (plan/m11 S1.12, M11-D32): 1,000 rows × 20 columns → applyView with 3 sorts + 10 filters and
// groupRows by person. Logs the time; fails above 200 ms. Real budgets are gated in M12.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { applyView, groupRows } from './database'
import type { DbColumnModel, DbColumnType, DbRowModel, ViewFilter } from './types'
import { CINDY, IVY, MINT, OLD, OPT_DOING, OPT_DONE, OPT_TODO, ctx } from './database/fixtures.test.helper'

const TYPES: DbColumnType[] = [
  'TEXT',
  'NUMBER',
  'SELECT',
  'MULTI_SELECT',
  'DATE',
  'CHECKBOX',
  'PERSON',
  'URL',
]
const options = [OPT_TODO, OPT_DOING, OPT_DONE]
const columns: DbColumnModel[] = [
  { id: 'title', type: 'TITLE', name: 'title', config: {}, position: 'a0' },
  ...Array.from({ length: 19 }, (_, i): DbColumnModel => {
    const type = TYPES[i % TYPES.length]!
    return {
      id: `c${i}`,
      type,
      name: `c${i}`,
      position: `b${String(i).padStart(2, '0')}`,
      config:
        type === 'SELECT' || type === 'MULTI_SELECT'
          ? { options }
          : type === 'NUMBER'
            ? { decimals: 2, thousands: true }
            : {},
    }
  }),
]
const byType = (t: DbColumnType) => columns.filter((c) => c.type === t)

function cellArb(c: DbColumnModel): fc.Arbitrary<unknown> {
  const optIds = options.map((o) => o.id)
  switch (c.type) {
    case 'TEXT':
      return fc.string({ maxLength: 30 })
    case 'URL':
      return fc.webUrl()
    case 'NUMBER':
      return fc.integer({ min: -1_000_000, max: 1_000_000 }).map(String)
    case 'SELECT':
      return fc.constantFrom(...optIds)
    case 'MULTI_SELECT':
      return fc.subarray(optIds)
    case 'DATE':
      return fc.integer({ min: 1, max: 28 }).map((d) => `2026-11-${String(d).padStart(2, '0')}`)
    case 'CHECKBOX':
      return fc.constant(true)
    default:
      return fc.subarray([CINDY, IVY, MINT, OLD])
  }
}

const rowArb = (i: number): fc.Arbitrary<DbRowModel> =>
  fc
    .record({
      title: fc.string({ maxLength: 40 }),
      cells: fc.record(
        Object.fromEntries(columns.slice(1).map((c) => [c.id, fc.option(cellArb(c), { nil: undefined })])),
      ),
    })
    .map((r) => ({ id: `r${String(i).padStart(4, '0')}`, title: r.title, cells: r.cells, position: `a${i}` }))

describe('database domain perf smoke (M11-D32)', () => {
  it('1,000 × 20: applyView (3 sorts, 10 filters) + groupRows by person, plus an unfiltered pass, < 200 ms', () => {
    const rows = Array.from(
      { length: 1000 },
      (_, i) => fc.sample(rowArb(i), { numRuns: 1, seed: 42 + i })[0]!,
    )
    const [text] = byType('TEXT')
    const [num] = byType('NUMBER')
    const [sel] = byType('SELECT')
    const [multi] = byType('MULTI_SELECT')
    const [date] = byType('DATE')
    const [check] = byType('CHECKBOX')
    const [person] = byType('PERSON')
    const [url] = byType('URL')
    const filters: ViewFilter[] = [
      { columnId: text!.id, op: 'notContains', value: 'zzz' },
      { columnId: num!.id, op: 'neq', value: '999999999' },
      { columnId: sel!.id, op: 'isNoneOf', value: [OPT_TODO.id] },
      { columnId: multi!.id, op: 'hasNoneOf', value: [OPT_DONE.id] },
      { columnId: date!.id, op: 'onOrBefore', value: { kind: 'date', date: '2026-11-25' } },
      { columnId: check!.id, op: 'checked' },
      { columnId: person!.id, op: 'hasNone', value: [OLD] },
      { columnId: url!.id, op: 'notContains', value: 'zzz' },
      { columnId: 'title', op: 'notContains', value: 'zzz' },
      { columnId: num!.id, op: 'neq', value: '-999999999' },
    ]
    const view = {
      config: {
        filters,
        sorts: [
          { columnId: sel!.id, dir: 'ASC' as const },
          { columnId: num!.id, dir: 'DESC' as const },
          { columnId: 'title', dir: 'ASC' as const },
        ],
        groupByColumnId: person!.id,
      },
    }
    const t0 = performance.now()
    const visible = applyView(rows, view, columns, ctx)
    const grouped = groupRows(visible, view, columns, ctx)
    // Worst case for sorting / grouping: the same keys over all 1,000 rows (no filter removes anything).
    const all = applyView(rows, { config: { sorts: view.config.sorts } }, columns, ctx)
    const allGrouped = groupRows(all, view, columns, ctx)
    const ms = performance.now() - t0
    console.info(
      `[perf] database applyView + groupRows over 1,000 × 20: ${ms.toFixed(1)} ms ` +
        `(filtered ${visible.length} rows, then unfiltered ${all.length} rows)`,
    )
    expect(grouped.ok && allGrouped.ok).toBe(true)
    expect(visible.length).toBeGreaterThan(100)
    expect(all).toHaveLength(1000)
    expect(ms).toBeLessThan(200)
  })
})
