// src/domain/units.ts — workload units (SPEC §5.1 BR-01…BR-03, PLAN §3.6, X02).
// M1 part: numeric(4,2) day strings ↔ integer centi-days by string parsing — no float at any step (M1-D22).
// M6 adds formatCd / parseCellInput.
import type { Cd } from './types'

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
