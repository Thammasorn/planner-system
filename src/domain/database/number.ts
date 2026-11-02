// src/domain/database/number.ts — BR-91 numbers: canonical decimal strings, never floats.
// Values are compared and rounded as BigInt scaled by 10^6 (≤ 15 integer digits, ≤ 6 decimals).
import type { NumberConfig } from '../types'

/** SPEC BR-91 literal. `-0` also matches the regex; isCanonicalDecimal rejects it. */
export const CANONICAL_DECIMAL_RE = /^-?(0|[1-9]\d{0,14})(\.\d{0,5}[1-9])?$/

const SCALE = 1_000_000n
const MAX_INT_DIGITS = 15
const MAX_DECIMALS = 6

export function isCanonicalDecimal(s: string): boolean {
  return s !== '-0' && CANONICAL_DECIMAL_RE.test(s)
}

/** Thai digits ๐–๙ (U+0E50–U+0E59) → ASCII. */
export function asciiDigits(s: string): string {
  return s.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
}

export type ParseNumberResult = { ok: true; value: string | null } | { ok: false }

const INPUT_RE = /^([+-]?)(\d*)(?:\.(\d*))?$/

/**
 * BR-91 typed input → canonical string. Strips whitespace and `,`, maps Thai digits, accepts a leading `+`,
 * `1.` and `.5`; leading zeros and trailing decimal zeros are dropped *before* the limits are checked
 * (`1.1234560` = 6 decimals); `-0` → `0`; empty → null; > 15 integer digits or > 6 decimals → fail.
 */
export function parseNumberInput(raw: string): ParseNumberResult {
  const s = asciiDigits(raw).replace(/[\s,]/g, '')
  if (s === '') return { ok: true, value: null }
  const m = INPUT_RE.exec(s)
  if (!m) return { ok: false }
  const intRaw = m[2]!
  const fracRaw = m[3] ?? ''
  if (intRaw === '' && fracRaw === '') return { ok: false }
  const int = intRaw.replace(/^0+/, '') || '0'
  const frac = fracRaw.replace(/0+$/, '')
  if (int.length > MAX_INT_DIGITS || frac.length > MAX_DECIMALS) return { ok: false }
  const zero = int === '0' && frac === ''
  const sign = m[1] === '-' && !zero ? '-' : ''
  return { ok: true, value: sign + int + (frac ? '.' + frac : '') }
}

/** Canonical decimal → BigInt × 10^6. Throws RangeError on a non-canonical string. */
export function toScaled(v: string): bigint {
  if (!isCanonicalDecimal(v)) throw new RangeError(`Not a canonical decimal: ${JSON.stringify(v)}`)
  const neg = v.startsWith('-')
  const [int, frac = ''] = (neg ? v.slice(1) : v).split('.')
  const mag = BigInt(int!) * SCALE + BigInt(frac.padEnd(MAX_DECIMALS, '0'))
  return neg ? -mag : mag
}

export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const x = toScaled(a)
  const y = toScaled(b)
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Display rounding on the digits: half-up **away from zero** (`0.5 → 1`, `-0.5 → -1`, `9.995 → 10.00` at 2),
 * always exactly `decimals` digits after the point; a result that rounds to zero has no sign (`-0.001 → 0.00`).
 */
export function roundDecimalString(v: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new RangeError(`decimals must be 0..${MAX_DECIMALS}, got ${decimals}`)
  }
  const scaled = toScaled(v)
  const neg = scaled < 0n
  const mag = neg ? -scaled : scaled
  const unit = 10n ** BigInt(MAX_DECIMALS - decimals)
  let q = mag / unit
  if ((mag % unit) * 2n >= unit) q += 1n
  const digits = q.toString().padStart(decimals + 1, '0')
  const int = digits.slice(0, digits.length - decimals)
  const frac = digits.slice(digits.length - decimals)
  return (neg && q !== 0n ? '-' : '') + int + (decimals > 0 ? '.' + frac : '')
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** M11-D36 display: round (decimals 0..6) or keep as stored (null), then optional `,` grouping. */
export function formatNumberCell(v: string, cfg: NumberConfig): string {
  if (!isCanonicalDecimal(v)) return v
  const s = cfg.decimals === null ? v : roundDecimalString(v, cfg.decimals)
  if (!cfg.thousands) return s
  const neg = s.startsWith('-')
  const [int, frac] = (neg ? s.slice(1) : s).split('.')
  return (neg ? '-' : '') + groupThousands(int!) + (frac === undefined ? '' : '.' + frac)
}
