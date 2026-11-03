// src/domain/database/convert.ts — BR-93 column type change (FR-1414, M11-D16, AC-1406).
import type { CellValue, ColumnConfig, DbColumnType, DbRowModel, ISODate, SelectOption } from '../types'
import { cellText, readCell, type DbColumnLike, optionsOf } from './cells'
import { parseDateCellInput } from './date'
import { DB_LIMITS, DbDomainError, OPTION_COLORS } from './limits'
import { compareDecimal, parseNumberInput } from './number'
import { isDbUrl } from './url'

/** A user the server offers for PERSON text matching (BR-93): only `active` users match. */
export interface ConvertUser {
  id: string
  name: string
  nickname: string | null
  email: string
  active: boolean
}

export interface ConvertCellCtx {
  users: readonly ConvertUser[]
  /** For `D/M` texts (BR-92). */
  today: ISODate
}

export interface ConvertColumnCtx extends ConvertCellCtx {
  /** Id for each option created from texts (server: randomUUID). */
  newId(): string
}

export interface ConvertColumnResult {
  config: ColumnConfig
  /** Every given row → its converted value (null = empty / delete the key). */
  values: Map<string, CellValue | null>
}

/** BR-93 CHECKBOX words (case-insensitive, trimmed). */
const TRUTHY_RE = /^(?:true|1|yes|y|ใช่|✓|x)$/iu
const SPLIT = ','

/** Prepared lookups so a whole column converts without rebuilding them per row. */
interface Prepared {
  today: ISODate
  people: ReadonlyMap<string, { name: string }>
  /** lower-cased name / nickname / email → active user ids. */
  personIndex: ReadonlyMap<string, readonly string[]>
}

function prepare(ctx: ConvertCellCtx): Prepared {
  const people = new Map(ctx.users.map((u) => [u.id, { name: u.name }]))
  const personIndex = new Map<string, string[]>()
  for (const u of ctx.users) {
    if (!u.active) continue
    const keys = new Set(
      [u.name, u.nickname ?? '', u.email].map((k) => k.trim().toLowerCase()).filter(Boolean),
    )
    for (const k of keys) personIndex.set(k, [...(personIndex.get(k) ?? []), u.id])
  }
  return { today: ctx.today, people, personIndex }
}

function parts(text: string): string[] {
  return text
    .split(SPLIT)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** Option names are cut to the name limit (FR-1475) both when created and when matched. */
function optionName(text: string): string {
  return text.trim().slice(0, DB_LIMITS.name)
}

function nullIfEmpty<T>(xs: T[]): T[] | null {
  return xs.length ? xs : null
}

function textTo(to: Pick<DbColumnLike, 'type' | 'config'>, text: string, p: Prepared): CellValue | null {
  switch (to.type) {
    case 'NUMBER': {
      const r = parseNumberInput(text)
      return r.ok ? r.value : null
    }
    case 'DATE': {
      // v3.7: two dates joined by → / – etc. become a range (BR-93)
      const d = parseDateCellInput(text, p.today)
      return d === 'invalid' ? null : d
    }
    case 'CHECKBOX':
      return TRUTHY_RE.test(text.trim()) ? true : null
    case 'URL':
      return isDbUrl(text.trim()) ? text.trim() : null
    case 'SELECT': {
      const name = optionName(text)
      return optionsOf(to).find((o) => o.name === name)?.id ?? null
    }
    case 'MULTI_SELECT': {
      const byName = new Map(optionsOf(to).map((o) => [o.name, o.id]))
      const ids = parts(text)
        .map((t) => byName.get(optionName(t)))
        .filter((id): id is string => id !== undefined)
      return nullIfEmpty([...new Set(ids)].slice(0, DB_LIMITS.multi))
    }
    case 'PERSON': {
      const ids = parts(text)
        .map((t) => p.personIndex.get(t.toLowerCase()))
        .filter((m): m is readonly string[] => m !== undefined && m.length === 1)
        .map((m) => m[0]!)
      return nullIfEmpty([...new Set(ids)].slice(0, DB_LIMITS.people))
    }
    default: {
      const t = text.slice(0, DB_LIMITS.text)
      return t.trim() ? t : null
    }
  }
}

function convertPrepared(
  from: DbColumnLike,
  to: Pick<DbColumnLike, 'type' | 'config'>,
  stored: unknown,
  p: Prepared,
): CellValue | null {
  if (from.type === 'TITLE' || to.type === 'TITLE') throw new DbDomainError('TITLE')
  const v = readCell(from, stored)
  if (v === null) return null
  if (from.type === to.type) return v
  if (from.type === 'SELECT' && to.type === 'MULTI_SELECT') return [v as string]
  if (from.type === 'MULTI_SELECT' && to.type === 'SELECT') return (v as string[])[0]!
  if (from.type === 'NUMBER' && to.type === 'CHECKBOX')
    return compareDecimal(v as string, '0') !== 0 ? true : null
  if (from.type === 'CHECKBOX' && to.type === 'NUMBER') return '1'
  return textTo(to, cellText(from, v, p), p)
}

/**
 * BR-93 for one value: (1) same type keeps it · (2) SELECT ↔ MULTI_SELECT · (3) NUMBER ↔ CHECKBOX · (4) otherwise
 * through the display text, parsed for the target (`to.config` holds the target options) · (5) TITLE either way
 * throws `DbDomainError('TITLE')`.
 */
export function convertCell(
  from: DbColumnLike,
  to: Pick<DbColumnLike, 'type' | 'config'>,
  stored: unknown,
  ctx: ConvertCellCtx,
): CellValue | null {
  return convertPrepared(from, to, stored, prepare(ctx))
}

function targetConfig(
  col: DbColumnLike,
  toType: DbColumnType,
  rows: readonly DbRowModel[],
  p: Prepared,
  newId: () => string,
): ColumnConfig {
  if (toType === 'NUMBER') return { decimals: null, thousands: true }
  if (toType !== 'SELECT' && toType !== 'MULTI_SELECT') return {}
  if (col.type === 'SELECT' || col.type === 'MULTI_SELECT') return col.config
  const names: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const text = cellText(col, row.cells[col.id], p)
    for (const t of toType === 'SELECT' ? [text] : parts(text)) {
      const name = optionName(t)
      if (name === '' || seen.has(name)) continue
      seen.add(name)
      names.push(name)
    }
  }
  const options: SelectOption[] = names.slice(0, DB_LIMITS.optionsPerColumn).map((name, i) => ({
    id: newId(),
    name,
    color: OPTION_COLORS[i % OPTION_COLORS.length]!,
  }))
  return { options }
}

/**
 * BR-93 for a whole column (all rows, live and deleted — the caller passes them in position order so options
 * are created in order of appearance). SELECT / MULTI_SELECT targets from other types get one option per unique
 * text (MULTI: split on `,`), colours cycling OPTION_COLORS; beyond 100 options the extra cells become empty.
 */
export function convertColumn(
  col: DbColumnLike,
  toType: DbColumnType,
  rows: readonly DbRowModel[],
  ctx: ConvertColumnCtx,
): ConvertColumnResult {
  if (col.type === 'TITLE' || toType === 'TITLE') throw new DbDomainError('TITLE')
  const p = prepare(ctx)
  const config = col.type === toType ? col.config : targetConfig(col, toType, rows, p, () => ctx.newId())
  const to = { type: toType, config }
  const values = new Map<string, CellValue | null>()
  for (const row of rows) values.set(row.id, convertPrepared(col, to, row.cells[col.id], p))
  return { config, values }
}
