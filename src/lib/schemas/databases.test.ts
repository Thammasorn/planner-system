// plan/m11 S0.5: every limit ±1, strict configs, filter value shapes by op family, exclusive ids.
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import {
  cellsPatchSchema,
  cellValueSchema,
  changeDatabaseColumnTypeSchema,
  columnConfigSchema,
  createDatabaseColumnSchema,
  createDatabaseRowsSchema,
  createDatabaseSchema,
  databaseParamsSchema,
  selectConfigSchema,
  DB_LIMITS,
  deleteDatabaseRowsSchema,
  FILTER_OPS,
  FILTER_VALUE_KIND,
  renameDatabaseSchema,
  revertDatabaseColumnTypeSchema,
  updateDatabaseColumnSchema,
  updateDatabaseRowSchema,
  updateDatabaseViewSchema,
  viewConfigSchema,
  viewFilterSchema,
} from './databases'
import { ensureRowBodySchema, rowBodyParamsSchema } from './row-pages'

const U = (n: number): string => `3f2504e0-4f89-41d3-9a0c-${n.toString(16).padStart(12, '0')}`
const A = U(1)
const ok = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown): boolean =>
  schema.safeParse(v).success

describe('DB_LIMITS (FR-1475, M11-D37)', () => {
  it('has the SPEC numbers', () => {
    expect(DB_LIMITS).toMatchObject({
      rows: 1000,
      columns: 30,
      views: 10,
      databasesPerPage: 20,
      optionsPerColumn: 100,
      multi: 20,
      people: 20,
      dbTitle: 200,
      name: 100,
      rowTitle: 500,
      text: 2000,
      sorts: 3,
      filters: 10,
      rowsPerAction: 50,
      widthMin: 80,
      widthMax: 600,
    })
  })
})

describe('cells (BR-90)', () => {
  it('string ≤ 2,000 · string[] ≤ 20 · true', () => {
    expect(ok(cellValueSchema, 'x'.repeat(2000))).toBe(true)
    expect(ok(cellValueSchema, 'x'.repeat(2001))).toBe(false)
    expect(
      ok(
        cellValueSchema,
        Array.from({ length: 20 }, (_, i) => U(i)),
      ),
    ).toBe(true)
    expect(
      ok(
        cellValueSchema,
        Array.from({ length: 21 }, (_, i) => U(i)),
      ),
    ).toBe(false)
    expect(ok(cellValueSchema, ['x'.repeat(65)])).toBe(false)
    expect(ok(cellValueSchema, true)).toBe(true)
    expect(ok(cellValueSchema, false)).toBe(false)
    expect(ok(cellValueSchema, 5)).toBe(false)
  })

  it('patch: uuid keys, null clears, ≤ 30 keys', () => {
    expect(ok(cellsPatchSchema, { [A]: null, [U(2)]: 'x' })).toBe(true)
    expect(ok(cellsPatchSchema, { notauuid: 'x' })).toBe(false)
    const keys = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [U(i), 'x']))
    expect(ok(cellsPatchSchema, keys(30))).toBe(true)
    expect(ok(cellsPatchSchema, keys(31))).toBe(false)
  })
})

describe('action inputs (§7.9)', () => {
  it('createDatabase / rename limits', () => {
    expect(ok(createDatabaseSchema, { pageId: A, view: 'KANBAN' })).toBe(true)
    expect(ok(createDatabaseSchema, { pageId: A, view: 'GALLERY' })).toBe(false)
    expect(ok(renameDatabaseSchema, { databaseId: A, baseVersion: 1, title: 'x'.repeat(200) })).toBe(true)
    expect(ok(renameDatabaseSchema, { databaseId: A, baseVersion: 1, title: 'x'.repeat(201) })).toBe(false)
    expect(ok(renameDatabaseSchema, { databaseId: A, baseVersion: 0, title: '' })).toBe(false)
    const r = renameDatabaseSchema.safeParse({ databaseId: A, baseVersion: 1, title: 'x'.repeat(201) })
    expect(r.success ? '' : r.error.issues[0]?.message).toBe(th.database.errors.limit.title(200))
  })

  it('createDatabaseRows: 1–50 rows, titles ≤ 500, afterRowId null/omitted', () => {
    const rows = (n: number) => Array.from({ length: n }, () => ({ title: 'แถว' }))
    expect(ok(createDatabaseRowsSchema, { databaseId: A, rows: rows(50) })).toBe(true)
    expect(ok(createDatabaseRowsSchema, { databaseId: A, rows: rows(51) })).toBe(false)
    expect(ok(createDatabaseRowsSchema, { databaseId: A, rows: [] })).toBe(false)
    expect(ok(createDatabaseRowsSchema, { databaseId: A, rows: [{ title: 'x'.repeat(501) }] })).toBe(false)
    expect(
      ok(createDatabaseRowsSchema, { databaseId: A, rows: [{ afterRowId: null, cells: { [A]: true } }] }),
    ).toBe(true)
    expect(ok(createDatabaseRowsSchema, { databaseId: A, rows: [{ cells: { [A]: null } }] })).toBe(false)
  })

  it('updateDatabaseRow: baseVersion positive int, move.afterRowId nullable', () => {
    expect(ok(updateDatabaseRowSchema, { rowId: A, baseVersion: 3, cells: { [A]: null } })).toBe(true)
    expect(ok(updateDatabaseRowSchema, { rowId: A, baseVersion: 3, move: { afterRowId: null } })).toBe(true)
    expect(ok(updateDatabaseRowSchema, { rowId: A, baseVersion: 1.5 })).toBe(false)
    expect(ok(updateDatabaseRowSchema, { rowId: 'x', baseVersion: 1 })).toBe(false)
  })

  it('deleteDatabaseRows: 1–1,000 ids', () => {
    expect(ok(deleteDatabaseRowsSchema, { rowIds: Array.from({ length: 1000 }, (_, i) => U(i)) })).toBe(true)
    expect(ok(deleteDatabaseRowsSchema, { rowIds: Array.from({ length: 1001 }, (_, i) => U(i)) })).toBe(false)
    expect(ok(deleteDatabaseRowsSchema, { rowIds: [] })).toBe(false)
  })

  it('columns: TITLE cannot be created or converted to; names 1–100 trimmed', () => {
    expect(ok(createDatabaseColumnSchema, { databaseId: A, type: 'PERSON' })).toBe(true)
    expect(ok(createDatabaseColumnSchema, { databaseId: A, type: 'TITLE' })).toBe(false)
    expect(ok(createDatabaseColumnSchema, { databaseId: A, type: 'TEXT', name: '   ' })).toBe(false)
    expect(ok(createDatabaseColumnSchema, { databaseId: A, type: 'TEXT', name: 'x'.repeat(100) })).toBe(true)
    expect(ok(createDatabaseColumnSchema, { databaseId: A, type: 'TEXT', name: 'x'.repeat(101) })).toBe(false)
    expect(ok(changeDatabaseColumnTypeSchema, { columnId: A, baseVersion: 1, type: 'TITLE' })).toBe(false)
    expect(ok(changeDatabaseColumnTypeSchema, { columnId: A, baseVersion: 1, type: 'URL' })).toBe(true)
  })

  it('column config: options ≤ 100 (id optional), colour enum, decimals 0–6 or null, strict', () => {
    const opts = (n: number) => ({
      options: Array.from({ length: n }, (_, i) => ({ name: `o${i}`, color: 'red' })),
    })
    expect(ok(columnConfigSchema, opts(100))).toBe(true)
    expect(ok(columnConfigSchema, opts(101))).toBe(false)
    expect(ok(columnConfigSchema, { options: [{ id: A, name: 'ก', color: 'teal' }] })).toBe(true)
    expect(ok(columnConfigSchema, { options: [{ name: 'ก', color: 'black' }] })).toBe(false)
    expect(ok(columnConfigSchema, { options: [{ name: ' ', color: 'red' }] })).toBe(false)
    expect(ok(columnConfigSchema, { decimals: 6, thousands: true })).toBe(true)
    expect(ok(columnConfigSchema, { decimals: null, thousands: false })).toBe(true)
    expect(ok(columnConfigSchema, { decimals: 7, thousands: false })).toBe(false)
    expect(ok(columnConfigSchema, { decimals: -1, thousands: false })).toBe(false)
    expect(ok(columnConfigSchema, {})).toBe(true)
    expect(ok(columnConfigSchema, { extra: 1 })).toBe(false)
    expect(
      ok(updateDatabaseColumnSchema, {
        columnId: A,
        baseVersion: 1,
        config: { decimals: 2, thousands: true },
      }),
    ).toBe(true)
  })

  it('revertDatabaseColumnType carries previous type/config/version/values', () => {
    expect(
      ok(revertDatabaseColumnTypeSchema, {
        columnId: A,
        previous: { type: 'TEXT', config: {}, columnVersion: 2, values: { [A]: 'x' } },
      }),
    ).toBe(true)
    expect(
      ok(revertDatabaseColumnTypeSchema, {
        columnId: A,
        previous: { type: 'TEXT', config: {}, columnVersion: 0, values: {} },
      }),
    ).toBe(false)
  })
})

describe('view config (§7.9, BR-94…97)', () => {
  it('strict: unknown keys rejected', () => {
    expect(ok(viewConfigSchema, {})).toBe(true)
    expect(ok(viewConfigSchema, { rowHeight: 2 })).toBe(false)
    expect(ok(viewConfigSchema, { sorts: [{ columnId: A, dir: 'ASC', x: 1 }] })).toBe(false)
  })

  it('widths are integers 80–600', () => {
    for (const [w, good] of [
      [80, true],
      [79, false],
      [600, true],
      [601, false],
      [100.5, false],
    ] as const)
      expect(ok(viewConfigSchema, { columnWidths: { [A]: w } }), String(w)).toBe(good)
  })

  it('≤ 3 sorts and ≤ 10 filters', () => {
    const sorts = (n: number) => Array.from({ length: n }, (_, i) => ({ columnId: U(i), dir: 'DESC' }))
    expect(ok(viewConfigSchema, { sorts: sorts(3) })).toBe(true)
    expect(ok(viewConfigSchema, { sorts: sorts(4) })).toBe(false)
    const filters = (n: number) => Array.from({ length: n }, (_, i) => ({ columnId: U(i), op: 'isEmpty' }))
    expect(ok(viewConfigSchema, { filters: filters(10) })).toBe(true)
    expect(ok(viewConfigSchema, { filters: filters(11) })).toBe(false)
  })

  it('filter values by op family; absent value = incomplete filter (allowed)', () => {
    expect(FILTER_OPS.every((op) => FILTER_VALUE_KIND[op] !== undefined)).toBe(true)
    const f = (op: string, value?: unknown) => ok(viewFilterSchema, { columnId: A, op, value })
    expect(f('contains', 'ก')).toBe(true)
    expect(f('contains', ['ก'])).toBe(false)
    expect(f('gt', '5')).toBe(true)
    expect(f('isAnyOf', [A])).toBe(true)
    expect(f('isAnyOf', A)).toBe(false)
    expect(f('hasAny', ['@me'])).toBe(true)
    expect(
      f(
        'hasAllOf',
        Array.from({ length: 101 }, (_, i) => U(i)),
      ),
    ).toBe(false)
    expect(f('is', { kind: 'date', date: '2026-09-30' })).toBe(true)
    expect(f('is', { kind: 'today' })).toBe(true)
    expect(f('is', { kind: 'date', date: '2026-02-30' })).toBe(false)
    expect(f('before', '2026-09-30')).toBe(false)
    expect(f('checked', 'x')).toBe(false)
    expect(f('checked')).toBe(true)
    expect(f('contains')).toBe(true)
    expect(f('like', 'x')).toBe(false)
    expect(f('contains', 'x'.repeat(2001))).toBe(false)
  })

  it('updateDatabaseView takes a strict config', () => {
    expect(ok(updateDatabaseViewSchema, { viewId: A, baseVersion: 1, config: { groupByColumnId: A } })).toBe(
      true,
    )
    expect(ok(updateDatabaseViewSchema, { viewId: A, baseVersion: 1, config: { groupBy: A } })).toBe(false)
    expect(ok(updateDatabaseViewSchema, { viewId: A, baseVersion: 1, afterViewId: null })).toBe(true)
  })
})

describe('params (X86)', () => {
  it('route params and row-body inputs are uuids', () => {
    expect(ok(databaseParamsSchema, { id: A, databaseId: U(2) })).toBe(true)
    expect(ok(databaseParamsSchema, { id: A, databaseId: 'x' })).toBe(false)
    expect(ok(rowBodyParamsSchema, { id: 'x' })).toBe(false)
    expect(ok(ensureRowBodySchema, { rowId: A })).toBe(true)
  })
})

describe('selectConfigSchema (BR-90: option names unique per column, trimmed, case-insensitive)', () => {
  it('rejects a repeated name in another case / with spaces; accepts distinct names', () => {
    const r = selectConfigSchema.safeParse({
      options: [
        { name: 'qwer', color: 'gray' },
        { name: ' QWER', color: 'blue' },
      ],
    })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe(th.database.errors.duplicateOption)
    expect(
      selectConfigSchema.safeParse({
        options: [
          { name: 'qwer', color: 'gray' },
          { name: 'asdf', color: 'blue' },
        ],
      }).success,
    ).toBe(true)
  })
})
