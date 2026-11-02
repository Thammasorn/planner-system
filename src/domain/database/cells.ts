// src/domain/database/cells.ts — BR-90 cell values: server validation (M11-D15), tolerant reads (FR-1416) and
// display text (BR-93 step 4). A cell absent from `cells` is empty; the row title lives in `row.title`.
import { isISODate } from '../dates'
import type { CellValue, DbColumnModel, DbPersonRef, DbRowModel, NumberConfig, SelectOption } from '../types'
import { DB_LIMITS } from './limits'
import { isCanonicalDecimal } from './number'
import { isDbUrl } from './url'

/** What the cell functions need of a column (DTOs with more fields fit). */
export type DbColumnLike = Pick<DbColumnModel, 'id' | 'type' | 'config'>

export type CellRejectReason =
  | 'TITLE'
  | 'TYPE'
  | 'TOO_LONG'
  | 'NOT_CANONICAL'
  | 'URL'
  | 'UNKNOWN_OPTION'
  | 'DUPLICATE'
  | 'TOO_MANY'
  | 'DATE'
  | 'INACTIVE_USER'

export type NormalizeCellResult =
  { ok: true; value: CellValue | null } | { ok: false; reason: CellRejectReason }

export interface NormalizeCellCtx {
  /** The value currently stored in this cell (PERSON: deactivated ids already there may stay). */
  stored?: unknown
  activeUserIds: ReadonlySet<string>
}

/** The options of a SELECT / MULTI_SELECT column; a malformed config reads as none. */
export function optionsOf(col: Pick<DbColumnModel, 'config'>): readonly SelectOption[] {
  const options = (col.config as { options?: unknown }).options
  return Array.isArray(options) ? (options as SelectOption[]) : []
}

/** The NUMBER display config with defaults (decimals as stored, thousands on — FR-1410). */
export function numberConfigOf(col: Pick<DbColumnModel, 'config'>): NumberConfig {
  const c = col.config as Partial<NumberConfig>
  return {
    decimals: typeof c.decimals === 'number' ? c.decimals : null,
    thousands: typeof c.thousands === 'boolean' ? c.thousands : true,
  }
}

/** BR-90: `""`, `[]`, `false`, `null` (and undefined) mean "no key". */
export function isEmptyCell(v: unknown): boolean {
  return v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)
}

const fail = (reason: CellRejectReason): NormalizeCellResult => ({ ok: false, reason })
const okv = (value: CellValue | null): NormalizeCellResult => ({ ok: true, value })

function idList(input: unknown, max: number): { ids: string[] } | { reason: CellRejectReason } {
  if (!Array.isArray(input) || !input.every((x) => typeof x === 'string' && x !== ''))
    return { reason: 'TYPE' }
  const ids = input as string[]
  if (new Set(ids).size !== ids.length) return { reason: 'DUPLICATE' }
  if (ids.length > max) return { reason: 'TOO_MANY' }
  return { ids }
}

/**
 * M11-D15 server validation of one cell against the column's **current** type and options. Empty → `null`
 * (delete the key). TITLE never lives in `cells`. NUMBER must already be canonical (the client parses).
 */
export function normalizeCellInput(
  col: DbColumnLike,
  input: unknown,
  ctx: NormalizeCellCtx,
): NormalizeCellResult {
  if (col.type === 'TITLE') return fail('TITLE')
  const value = typeof input === 'string' ? input.trim() : input
  if (isEmptyCell(value)) return okv(null)
  switch (col.type) {
    case 'TEXT':
    case 'URL':
    case 'NUMBER':
    case 'DATE':
    case 'SELECT': {
      if (typeof value !== 'string') return fail('TYPE')
      if (value.length > DB_LIMITS.text) return fail('TOO_LONG')
      if (col.type === 'URL' && !isDbUrl(value)) return fail('URL')
      if (col.type === 'NUMBER' && !isCanonicalDecimal(value)) return fail('NOT_CANONICAL')
      if (col.type === 'DATE' && !isISODate(value)) return fail('DATE')
      if (col.type === 'SELECT' && !optionsOf(col).some((o) => o.id === value)) return fail('UNKNOWN_OPTION')
      return okv(value)
    }
    case 'CHECKBOX':
      return value === true ? okv(true) : fail('TYPE')
    case 'MULTI_SELECT': {
      const r = idList(value, DB_LIMITS.multi)
      if ('reason' in r) return fail(r.reason)
      const known = new Set(optionsOf(col).map((o) => o.id))
      return r.ids.every((id) => known.has(id)) ? okv(r.ids) : fail('UNKNOWN_OPTION')
    }
    case 'PERSON': {
      const r = idList(value, DB_LIMITS.people)
      if ('reason' in r) return fail(r.reason)
      const kept = new Set(Array.isArray(ctx.stored) ? (ctx.stored as unknown[]) : [])
      return r.ids.every((id) => ctx.activeUserIds.has(id) || kept.has(id))
        ? okv(r.ids)
        : fail('INACTIVE_USER')
    }
  }
}

function uniqueStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x !== ''))]
}

/**
 * Tolerant read of a stored cell (BR-90, FR-1416): wrong shapes → null, unknown (deleted) option ids dropped,
 * duplicates dropped, an empty list → null. TITLE values are not in `cells` (use rowValue).
 */
export function readCell(col: DbColumnLike, stored: unknown): CellValue | null {
  if (stored === undefined || stored === null) return null
  switch (col.type) {
    case 'TITLE':
      return null
    case 'TEXT':
    case 'URL':
      return typeof stored === 'string' && stored.trim() !== '' ? stored : null
    case 'NUMBER':
      return typeof stored === 'string' && isCanonicalDecimal(stored) ? stored : null
    case 'DATE':
      return typeof stored === 'string' && isISODate(stored) ? stored : null
    case 'CHECKBOX':
      return stored === true ? true : null
    case 'SELECT':
      return typeof stored === 'string' && optionsOf(col).some((o) => o.id === stored) ? stored : null
    case 'MULTI_SELECT': {
      const known = new Set(optionsOf(col).map((o) => o.id))
      const ids = uniqueStrings(stored).filter((id) => known.has(id))
      return ids.length ? ids : null
    }
    case 'PERSON': {
      const ids = uniqueStrings(stored)
      return ids.length ? ids : null
    }
  }
}

/** The value of `col` in `row`: TITLE → the title (blank → null), otherwise readCell. */
export function rowValue(row: Pick<DbRowModel, 'title' | 'cells'>, col: DbColumnLike): CellValue | null {
  if (col.type === 'TITLE') return row.title.trim() !== '' ? row.title : null
  return readCell(col, row.cells[col.id])
}

/** Joins option names / person names for display and conversion. */
const JOIN = ', '
const CHECK_MARK = '✓'

/**
 * BR-93 step 4 display text: option names joined `, `, `✓`, person full names joined `, ` (ids missing from
 * `people` skipped), canonical numbers, ISO dates. Empty → `''`.
 */
export function cellText(
  col: DbColumnLike,
  value: unknown,
  ctx: { people: ReadonlyMap<string, Pick<DbPersonRef, 'name'>> },
): string {
  if (col.type === 'TITLE') return typeof value === 'string' ? value : ''
  const v = readCell(col, value)
  if (v === null) return ''
  switch (col.type) {
    case 'CHECKBOX':
      return CHECK_MARK
    case 'SELECT':
    case 'MULTI_SELECT': {
      const byId = new Map(optionsOf(col).map((o) => [o.id, o.name]))
      return (Array.isArray(v) ? v : [v as string]).map((id) => byId.get(id)!).join(JOIN)
    }
    case 'PERSON':
      return (v as string[])
        .map((id) => ctx.people.get(id)?.name)
        .filter((n): n is string => n !== undefined)
        .join(JOIN)
    default:
      return v as string
  }
}
