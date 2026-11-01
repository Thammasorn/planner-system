// src/domain/units.ts — workload units (SPEC §5.1 BR-01…BR-03, PLAN §3.6, X02).
// M1 part: numeric(4,2) day strings ↔ integer centi-days by string parsing — no float at any step (M1-D22).
// M6 part: cell parsing (BR-26/27), f/h, display formatting (FR-804, §8.8).
import type { CellUnit, Cd, Granularity } from './types'

const NUMERIC_RE = /^(\d{1,3})(?:\.(\d{1,2}))?$/

/** `'1.25'` → `125`. Accepts what Postgres returns for numeric(4,2) (up to 3 integer digits, 0–2 decimals). */
export function numericToCd(v: string): Cd {
  const m = NUMERIC_RE.exec(v)
  if (!m) throw new RangeError(`Invalid numeric day value: ${JSON.stringify(v)}`)
  const whole = Number.parseInt(m[1]!, 10)
  const frac = Number.parseInt((m[2] ?? '').padEnd(2, '0'), 10)
  return whole * 100 + frac
}

/** `125` → `'1.25'`. Only non-negative safe integers. */
export function cdToNumeric(cd: Cd): string {
  if (!Number.isSafeInteger(cd) || cd < 0) throw new RangeError(`Invalid cd value: ${cd}`)
  return `${Math.trunc(cd / 100)}.${String(cd % 100).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------------------------------------------
// M6 part (X02, X65, M6-D9/D10): cell parsing and display. Integer math only — no float parsing, no fixed-point
// string formatting, no float rounding. Every quotient below is an exact integer quotient of non-negative safe integers.
// ---------------------------------------------------------------------------------------------------------------

/** Result of parsing what a user typed into a grid cell (or the FR-612 total). */
export type ParsedCell =
  | { kind: 'value'; cd: Cd } // already rounded to 25 (typed) or exact (f)
  | { kind: 'clear' } // '' or a value that rounds to 0
  | { kind: 'skip'; reason: 'NO_CAPACITY' } // f/h on a cap-0 cell
  | { kind: 'invalid'; reason: 'FORMAT' | 'NEGATIVE' | 'MAX' }

/** BR-26 maxima per allocation row. */
const MAX_BY_GRANULARITY: Readonly<Record<Granularity, Cd>> = { WEEK: 700, DAY: 100 }

/** Code points: Thai digits ๐–๙ (U+0E50–U+0E59); Kedmanee keys that sit on F (ด U+0E14) and H (้ U+0E49). */
const THAI_ZERO = 0x0e50
const THAI_NINE = 0x0e59
const KEDMANEE_F = 0x0e14
const KEDMANEE_H = 0x0e49

const INPUT_RE = /^(-?)(\d{0,3})(?:\.(\d{1,4}))?(\s*%)?$/

function assertCd(cd: Cd, what: string): void {
  if (!Number.isSafeInteger(cd)) throw new RangeError(`${what} must be an integer cd, got ${cd}`)
}

function assertNonNegativeCd(cd: Cd, what: string): void {
  assertCd(cd, what)
  if (cd < 0) throw new RangeError(`${what} must be ≥ 0, got ${cd}`)
}

/** Exact ⌊a / b⌋ for a ≥ 0, b > 0 (both safe integers). */
function idiv(a: number, b: number): number {
  return (a - (a % b)) / b
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** Trim, Thai digits → ASCII, ',' → '.', Kedmanee ด → 'f' and ้ → 'h', lower-case. */
export function normalizeNumericInput(raw: string): string {
  let out = ''
  for (const ch of raw.trim()) {
    const c = ch.codePointAt(0)!
    if (c >= THAI_ZERO && c <= THAI_NINE) out += String.fromCharCode(48 + c - THAI_ZERO)
    else if (c === KEDMANEE_F) out += 'f'
    else if (c === KEDMANEE_H) out += 'h'
    else if (ch === ',') out += '.'
    else out += ch.toLowerCase()
  }
  return out
}

/** f = the cell's exact capacity (never rounded, X65). */
export function fullCapacityCd(capCd: Cd): Cd {
  assertNonNegativeCd(capCd, 'capCd')
  return capCd
}

/** h = half the capacity rounded half-up to 25 cd: 25 · ⌊(2·cap + 50) / 100⌋. */
export function halfCapacityCd(capCd: Cd): Cd {
  assertNonNegativeCd(capCd, 'capCd')
  return 25 * idiv(2 * capCd + 50, 100)
}

/** BR-27 on an integer: nearest multiple of 25, half-up — 25 · ⌊(2·cd + 25) / 50⌋. */
export function roundToQuarterCd(cd: Cd): Cd {
  assertNonNegativeCd(cd, 'cd')
  return 25 * idiv(2 * cd + 25, 50)
}

/** BR-26: WEEK 0 < v ≤ 700, DAY 0 < v ≤ 100; 0 deletes the row. */
export function validateCellCd(granularity: Granularity, cd: Cd): 'ok' | 'clear' | 'MAX' | 'NEGATIVE' {
  assertCd(cd, 'cd')
  if (cd < 0) return 'NEGATIVE'
  if (cd === 0) return 'clear'
  return cd > MAX_BY_GRANULARITY[granularity] ? 'MAX' : 'ok'
}

/**
 * Parses a typed cell value (M6-D10). The exact decimal n / 10^k is rounded **once** to 25 cd, half-up:
 * DAYS k25 = ⌊(200·n + 25·D) / (50·D)⌋, FRACTION k25 = ⌊(2·n·cap + 25·D) / (50·D)⌋ with D = 10^k (×100 with '%').
 * FRACTION with capCd = 0 parses as DAYS (M6-D9). f/h use the capacity helpers and skip cap-0 cells.
 */
export function parseCellInput(raw: string, o: { unit: CellUnit; capCd: Cd; maxCd: Cd }): ParsedCell {
  assertNonNegativeCd(o.capCd, 'capCd')
  assertNonNegativeCd(o.maxCd, 'maxCd')
  const s = normalizeNumericInput(raw)
  const withMax = (cd: Cd): ParsedCell =>
    cd === 0 ? { kind: 'clear' } : cd > o.maxCd ? { kind: 'invalid', reason: 'MAX' } : { kind: 'value', cd }

  if (s === '') return { kind: 'clear' }
  if (s === 'f' || s === 'h') {
    if (o.capCd === 0) return { kind: 'skip', reason: 'NO_CAPACITY' }
    return withMax(s === 'f' ? fullCapacityCd(o.capCd) : halfCapacityCd(o.capCd))
  }

  const m = INPUT_RE.exec(s)
  const intPart = m?.[2] ?? ''
  const decPart = m?.[3] ?? ''
  if (!m || intPart + decPart === '') return { kind: 'invalid', reason: 'FORMAT' }
  const fraction = o.unit === 'FRACTION' && o.capCd > 0
  const percent = m[4] !== undefined
  if (percent && !fraction) return { kind: 'invalid', reason: 'FORMAT' }
  if (m[1] === '-') return { kind: 'invalid', reason: 'NEGATIVE' }

  const n = Number.parseInt(intPart + decPart, 10)
  let denom = 10 ** decPart.length
  if (percent) denom *= 100
  const k25 = fraction ? idiv(2 * n * o.capCd + 25 * denom, 50 * denom) : idiv(200 * n + 25 * denom, 50 * denom)
  return withMax(25 * k25)
}

/** ⌊(200·cd + base) / (2·base)⌋ = cd / base in hundredths, half-up (fraction unit, FR-804). baseCd > 0. */
export function fractionHundredths(cd: Cd, baseCd: Cd): number {
  assertNonNegativeCd(cd, 'cd')
  assertNonNegativeCd(baseCd, 'baseCd')
  if (baseCd === 0) throw new RangeError('baseCd must be > 0')
  return idiv(200 * cd + baseCd, 2 * baseCd)
}

function formatAbs(cd: Cd, o: { unit: CellUnit; baseCd?: Cd; decimals: 1 | 2 }): string {
  if (o.unit === 'FRACTION' && o.baseCd !== undefined && o.baseCd > 0) {
    if (o.decimals === 2) {
      const h = fractionHundredths(cd, o.baseCd)
      return `${idiv(h, 100)}.${pad2(h % 100)}`
    }
    const t = idiv(20 * cd + o.baseCd, 2 * o.baseCd)
    return `${idiv(t, 10)}.${t % 10}`
  }
  // DAYS — and FRACTION without a capacity, shown as days with the grid's 1 decimal (M6-D9).
  if (o.unit === 'DAYS' && o.decimals === 2) return `${idiv(cd, 100)}.${pad2(cd % 100)}`
  const t = idiv(cd + 5, 10)
  return `${idiv(t, 10)}.${t % 10}`
}

/**
 * Display text of a load (§8.8): 0 → ''; DAYS 1 decimal half-up (375 → '3.8'), 2 decimals exact (375 → '3.75');
 * FRACTION = cd ÷ baseCd in 2 decimals (250 / 500 → '0.50'); FRACTION with baseCd 0 or missing → days, 1 decimal.
 */
export function formatCd(cd: Cd, o: { unit: CellUnit; baseCd?: Cd; decimals: 1 | 2 }): string {
  assertCd(cd, 'cd')
  if (cd === 0) return ''
  return cd < 0 ? `-${formatAbs(-cd, o)}` : formatAbs(cd, o)
}
