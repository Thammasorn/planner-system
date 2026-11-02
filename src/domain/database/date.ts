// src/domain/database/date.ts — BR-92 typed date input → ISODate (Buddhist years ≥ 2400 → −543).
import { isISODate } from '../dates'
import type { ISODate } from '../types'
import { asciiDigits } from './number'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const DMY_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/
/** BR-92: a 4-digit year ≥ 2400 is a Buddhist year. */
const BE_MIN = 2400
const BE_OFFSET = 543

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0')
}

/**
 * `YYYY-MM-DD`, `D/M/YYYY` (year ≥ 2400 = พ.ศ.), `D/M` (year of `today`); Thai digits accepted.
 * Empty → null; anything else or a date that does not exist (31/2) → 'invalid'.
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- ISODate is a string alias; 'invalid' names the sentinel of the plan/m11 S1.4 contract.
export function parseDateInput(raw: string, today: ISODate): ISODate | null | 'invalid' {
  const s = asciiDigits(raw).trim()
  if (s === '') return null
  if (ISO_RE.test(s)) return isISODate(s) ? s : 'invalid'
  const m = DMY_RE.exec(s)
  if (!m) return 'invalid'
  let year = m[3] === undefined ? Number(today.slice(0, 4)) : Number(m[3])
  if (year >= BE_MIN) year -= BE_OFFSET
  const iso = `${pad(year, 4)}-${pad(Number(m[2]), 2)}-${pad(Number(m[1]), 2)}`
  return isISODate(iso) ? iso : 'invalid'
}
