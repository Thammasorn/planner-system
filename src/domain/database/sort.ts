// src/domain/database/sort.ts — BR-94 row order: per sort key, empties always last (both directions), then
// `position` (plain code-unit `<`, matching `COLLATE "C"`), then `id`.
import type { CellValue, DbColumnModel, DbCtx, DbRowModel, ViewSort } from '../types'
import { optionsOf, rowValue, type DbColumnLike } from './cells'
import { dateSpanOf } from './date'
import { toScaled } from './number'

/** BR-94 text order. */
export function makeCollator(): Intl.Collator {
  return new Intl.Collator('th', { numeric: true, sensitivity: 'base' })
}

let defaultCollator: Intl.Collator | null = null
/** ctx.collator, else one shared default (creating a Collator per comparison is slow). */
export function collatorOf(ctx: Pick<DbCtx, 'collator'>): Intl.Collator {
  return ctx.collator ?? (defaultCollator ??= makeCollator())
}

/** A comparable key per row and sort; `null` = empty. */
type Key = string | bigint | number | readonly (string | number)[] | null

interface PreparedSort {
  col: DbColumnLike
  sign: 1 | -1
  key(row: DbRowModel): Key
  cmp(a: NonNullable<Key>, b: NonNullable<Key>): number
}

function cmpPrimitive(a: string | number | bigint, b: string | number | bigint): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function cmpList(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
  each: (x: never, y: never) => number,
): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const c = each(a[i] as never, b[i] as never)
    if (c !== 0) return c
  }
  return a.length - b.length
}

function prepareSort(col: DbColumnLike, dir: ViewSort['dir'], ctx: DbCtx): PreparedSort {
  const collator = collatorOf(ctx)
  const sign = dir === 'DESC' ? -1 : 1
  const raw = (row: DbRowModel): CellValue | null => rowValue(row, col)
  switch (col.type) {
    case 'NUMBER':
      return {
        col,
        sign,
        key: (r) => mapNull(raw(r), (v) => toScaled(v as string)),
        cmp: (a, b) => cmpPrimitive(a as bigint, b as bigint),
      }
    case 'DATE':
      // v3.7: by start, then end (a single date = a one-day span, so it comes before a range from the same day)
      return {
        col,
        sign,
        key: (r) =>
          mapNull(raw(r), (v) => {
            const span = dateSpanOf(v)!
            return `${span.start}|${span.end}`
          }),
        cmp: (a, b) => cmpPrimitive(a as string, b as string),
      }
    case 'CHECKBOX':
      // BR-94: unticked < ticked and unticked is not empty.
      return {
        col,
        sign,
        key: (r) => (raw(r) === true ? 1 : 0),
        cmp: (a, b) => cmpPrimitive(a as number, b as number),
      }
    case 'SELECT':
    case 'MULTI_SELECT': {
      const index = new Map(optionsOf(col).map((o, i) => [o.id, i]))
      return {
        col,
        sign,
        key: (r) =>
          mapNull(raw(r), (v) => (Array.isArray(v) ? v : [v as string]).map((id) => index.get(id)!)),
        cmp: (a, b) => cmpList(a as number[], b as number[], (x: number, y: number) => x - y),
      }
    }
    case 'PERSON':
      return {
        col,
        sign,
        key: (r) => mapNull(raw(r), (v) => (v as string[]).map((id) => ctx.people.get(id)?.name ?? id)),
        cmp: (a, b) =>
          cmpList(
            a as string[],
            b as string[],
            (x: string, y: string) => collator.compare(x, y) || cmpPrimitive(x, y),
          ),
      }
    default:
      return {
        col,
        sign,
        key: raw as (r: DbRowModel) => Key,
        cmp: (a, b) => collator.compare(a as string, b as string),
      }
  }
}

function mapNull<T>(v: CellValue | null, f: (v: CellValue) => T): T | null {
  return v === null ? null : f(v)
}

function prepareSorts(sorts: readonly ViewSort[], cols: readonly DbColumnLike[], ctx: DbCtx): PreparedSort[] {
  const byId = new Map(cols.map((c) => [c.id, c]))
  const out: PreparedSort[] = []
  for (const s of sorts) {
    const col = byId.get(s.columnId)
    if (col) out.push(prepareSort(col, s.dir, ctx)) // a sort on a missing column is suspended (FR-1415)
  }
  return out
}

function tieBreak(a: DbRowModel, b: DbRowModel): number {
  return cmpPrimitive(a.position, b.position) || cmpPrimitive(a.id, b.id)
}

function compareKeys(ka: readonly Key[], kb: readonly Key[], prepared: readonly PreparedSort[]): number {
  for (let i = 0; i < prepared.length; i++) {
    const a = ka[i]!
    const b = kb[i]!
    if (a === null || b === null) {
      if (a === b) continue
      return a === null ? 1 : -1 // empties last in both directions
    }
    const c = prepared[i]!.cmp(a, b)
    if (c !== 0) return c < 0 ? -prepared[i]!.sign : prepared[i]!.sign
  }
  return 0
}

/** BR-94 comparator for two rows (negative = a first). Sorts on missing columns are ignored. */
export function compareRows(
  a: DbRowModel,
  b: DbRowModel,
  sorts: readonly ViewSort[],
  cols: readonly DbColumnLike[],
  ctx: DbCtx,
): number {
  const prepared = prepareSorts(sorts, cols, ctx)
  const keys = (r: DbRowModel) => prepared.map((p) => p.key(r))
  return compareKeys(keys(a), keys(b), prepared) || tieBreak(a, b)
}

/** BR-94 order of `rows` (a new array; keys are computed once per row). */
export function sortRows<R extends DbRowModel>(
  rows: readonly R[],
  sorts: readonly ViewSort[],
  cols: readonly DbColumnLike[] | readonly DbColumnModel[],
  ctx: DbCtx,
): R[] {
  const prepared = prepareSorts(sorts, cols, ctx)
  const decorated = rows.map((row) => ({ row, keys: prepared.map((p) => p.key(row)) }))
  decorated.sort((x, y) => compareKeys(x.keys, y.keys, prepared) || tieBreak(x.row, y.row))
  return decorated.map((d) => d.row)
}
