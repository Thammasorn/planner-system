// src/lib/home/percent.ts — team utilisation as integer tenths of a percent (M10-D18, X67). Integers only (BR-03).
import { th } from '@/i18n/th'

/** null when capCd ≤ 0, else half-up of 1000·load/cap = floor((2000·load + cap) / (2·cap)). */
export function percentTenths(loadCd: number, capCd: number): number | null {
  if (capCd <= 0) return null
  return Math.floor((2000 * loadCd + capCd) / (2 * capCd))
}

/** 725 → '72.5%'; null → th.home.manager.noCapacity ('—'). */
export function formatPercentTenths(t: number | null): string {
  if (t === null) return th.home.manager.noCapacity
  const sign = t < 0 ? '-' : ''
  const a = Math.abs(t)
  return `${sign}${Math.floor(a / 10)}.${a % 10}%`
}
