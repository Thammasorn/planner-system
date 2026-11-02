// src/domain/database/filter.ts — BR-95 filters (AND only) with the M11-D23 operators, and the values a new
// row inherits from the open view's equality filters (FR-1423).
import { isISODate } from '../dates'
import type {
  CellValue,
  DateRef,
  DbColumnType,
  DbCtx,
  DbRowModel,
  FilterOp,
  ISODate,
  ViewFilter,
} from '../types'
import { optionsOf, rowValue, type DbColumnLike } from './cells'
import { DB_LIMITS, ME_TOKEN } from './limits'
import { compareDecimal, parseNumberInput } from './number'
import { isDbUrl } from './url'

const TEXT_OPS = ['contains', 'notContains', 'equals', 'isEmpty', 'isNotEmpty'] as const
const OPS: Readonly<Record<DbColumnType, readonly FilterOp[]>> = {
  TITLE: TEXT_OPS,
  TEXT: TEXT_OPS,
  URL: TEXT_OPS,
  NUMBER: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'],
  SELECT: ['isAnyOf', 'isNoneOf', 'isEmpty', 'isNotEmpty'],
  MULTI_SELECT: ['hasAnyOf', 'hasAllOf', 'hasNoneOf', 'isEmpty', 'isNotEmpty'],
  DATE: ['is', 'before', 'after', 'onOrAfter', 'onOrBefore', 'isEmpty', 'isNotEmpty'],
  CHECKBOX: ['checked', 'unchecked'],
  PERSON: ['hasAny', 'hasNone', 'isEmpty', 'isNotEmpty'],
}

/** M11-D23: the operators offered for a column type, in menu order. */
export function filterOpsFor(type: DbColumnType): readonly FilterOp[] {
  return OPS[type]
}

const NO_VALUE: ReadonlySet<FilterOp> = new Set(['isEmpty', 'isNotEmpty', 'checked', 'unchecked'])

/** A filter after validation: the reference value in the form the matcher needs. */
type Resolved =
  | { kind: 'none' }
  | { kind: 'text'; q: string }
  | { kind: 'number'; v: string }
  | { kind: 'ids'; ids: ReadonlySet<string>; list: readonly string[] }
  | { kind: 'date'; ref: DateRef }

function textNorm(s: string): string {
  return s.trim().toLocaleLowerCase()
}

/** Validates the value for the op and column; null = incomplete (skipped and shown dimmed). */
function resolve(f: ViewFilter, col: DbColumnLike): Resolved | null {
  if (!OPS[col.type].includes(f.op)) return null
  if (NO_VALUE.has(f.op)) return { kind: 'none' }
  const v = f.value
  if (col.type === 'NUMBER') {
    if (typeof v !== 'string') return null
    const r = parseNumberInput(v)
    return r.ok && r.value !== null ? { kind: 'number', v: r.value } : null
  }
  if (col.type === 'DATE') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null
    return v.kind === 'today' || isISODate(v.date) ? { kind: 'date', ref: v } : null
  }
  if (col.type === 'SELECT' || col.type === 'MULTI_SELECT' || col.type === 'PERSON') {
    if (!Array.isArray(v)) return null
    let list = v.filter((x): x is string => typeof x === 'string')
    // BR-95: a reference to a deleted option is empty, so a list of only deleted options is incomplete.
    if (col.type !== 'PERSON') {
      const live = new Set(optionsOf(col).map((o) => o.id))
      list = list.filter((id) => live.has(id))
    }
    return list.length ? { kind: 'ids', ids: new Set(list), list } : null
  }
  // TITLE / TEXT / URL (every CHECKBOX op takes no value, so CHECKBOX never gets here).
  return typeof v === 'string' && v.trim() !== '' ? { kind: 'text', q: textNorm(v) } : null
}

/** True when the filter applies (op fits the column type and its reference value is filled in). */
export function isFilterComplete(f: ViewFilter, col: DbColumnLike): boolean {
  return resolve(f, col) !== null
}

function dateOf(ref: DateRef, today: ISODate): ISODate {
  return ref.kind === 'today' ? today : ref.date
}

function matchOne(op: FilterOp, r: Resolved, v: CellValue | null, ctx: DbCtx): boolean {
  switch (r.kind) {
    case 'none':
      return op === 'isEmpty'
        ? v === null
        : op === 'isNotEmpty'
          ? v !== null
          : op === 'checked'
            ? v === true
            : v !== true
    case 'text': {
      const s = v === null ? null : textNorm(v as string)
      if (op === 'contains') return s !== null && s.includes(r.q)
      if (op === 'notContains') return s === null || !s.includes(r.q)
      return s === r.q // equals
    }
    case 'number': {
      // ≠ is a negative operator: an empty cell passes (BR-95 reading, recorded as an S1 decision).
      if (v === null) return op === 'neq'
      const c = compareDecimal(v as string, r.v)
      if (op === 'eq') return c === 0
      if (op === 'neq') return c !== 0
      if (op === 'gt') return c > 0
      if (op === 'gte') return c >= 0
      return op === 'lt' ? c < 0 : c <= 0
    }
    case 'date': {
      if (v === null) return false
      const ref = dateOf(r.ref, ctx.today)
      const d = v as string
      if (op === 'is') return d === ref
      if (op === 'before') return d < ref
      if (op === 'after') return d > ref
      return op === 'onOrAfter' ? d >= ref : d <= ref
    }
    case 'ids': {
      // SELECT / MULTI_SELECT / PERSON ("@me" = the viewer).
      const want = (id: string) => r.ids.has(id) || (id === ctx.viewerId && r.ids.has(ME_TOKEN))
      const have = v === null ? [] : Array.isArray(v) ? v : [v as string]
      if (op === 'hasAllOf') {
        const set = new Set(have)
        return r.list.every((id) => set.has(id))
      }
      const any = have.some(want)
      return op === 'isAnyOf' || op === 'hasAnyOf' || op === 'hasAny' ? any : !any
    }
  }
}

function liveFilters(
  filters: readonly ViewFilter[],
  cols: readonly DbColumnLike[],
): { f: ViewFilter; col: DbColumnLike; r: Resolved }[] {
  const byId = new Map(cols.map((c) => [c.id, c]))
  const out: { f: ViewFilter; col: DbColumnLike; r: Resolved }[] = []
  for (const f of filters) {
    const col = byId.get(f.columnId)
    const r = col ? resolve(f, col) : null
    if (col && r) out.push({ f, col, r })
  }
  return out
}

/**
 * BR-95: AND of every filter (none = every row). Filters on missing columns or with an incomplete value are
 * skipped; negative operators (notContains, isNoneOf, hasNoneOf, hasNone, neq) pass empty cells; deleted options
 * read as empty; deactivated people count as usual.
 */
export function matchesFilters(
  row: DbRowModel,
  filters: readonly ViewFilter[],
  cols: readonly DbColumnLike[],
  ctx: DbCtx,
): boolean {
  return makeRowFilter(filters, cols, ctx)(row)
}

/** matchesFilters with the filters prepared once (for many rows). */
export function makeRowFilter(
  filters: readonly ViewFilter[],
  cols: readonly DbColumnLike[],
  ctx: DbCtx,
): (row: DbRowModel) => boolean {
  const live = liveFilters(filters, cols)
  return (row) => live.every(({ f, col, r }) => matchOne(f.op, r, rowValue(row, col), ctx))
}

export interface InheritedValues {
  title?: string
  cells: Record<string, CellValue>
}

/**
 * M11-D23 / FR-1423: the values a new row takes from the view's complete "equals / is" filters so it stays
 * visible — title/text/url `equals`, number `eq`, select `isAnyOf` with exactly one option, multi `hasAnyOf` /
 * `hasAllOf` (union, ≤ 20), date `is` (`today` → ctx.today), checkbox `checked`, person `hasAny` (`@me` → viewer).
 */
export function valuesFromFilters(
  filters: readonly ViewFilter[],
  cols: readonly DbColumnLike[],
  ctx: DbCtx,
): InheritedValues {
  const out: InheritedValues = { cells: {} }
  const addIds = (colId: string, ids: readonly string[], max: number) => {
    const prev = (out.cells[colId] as string[] | undefined) ?? []
    out.cells[colId] = [...new Set([...prev, ...ids])].slice(0, max)
  }
  for (const { f, col, r } of liveFilters(filters, cols)) {
    if (r.kind === 'text' && f.op === 'equals') {
      const s = (f.value as string).trim()
      if (col.type === 'TITLE') out.title = s.slice(0, DB_LIMITS.rowTitle)
      else if (col.type === 'TEXT') out.cells[col.id] = s.slice(0, DB_LIMITS.text)
      else if (isDbUrl(s)) out.cells[col.id] = s
    } else if (r.kind === 'number' && f.op === 'eq') {
      out.cells[col.id] = r.v
    } else if (r.kind === 'ids' && f.op === 'isAnyOf' && r.list.length === 1) {
      out.cells[col.id] = r.list[0]!
    } else if (r.kind === 'ids' && (f.op === 'hasAnyOf' || f.op === 'hasAllOf')) {
      addIds(col.id, r.list, DB_LIMITS.multi)
    } else if (r.kind === 'ids' && f.op === 'hasAny') {
      addIds(
        col.id,
        r.list.map((id) => (id === ME_TOKEN ? ctx.viewerId : id)),
        DB_LIMITS.people,
      )
    } else if (r.kind === 'date' && f.op === 'is') {
      out.cells[col.id] = dateOf(r.ref, ctx.today)
    } else if (f.op === 'checked') {
      out.cells[col.id] = true
    }
  }
  return out
}
