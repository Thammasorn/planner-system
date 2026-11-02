// src/lib/workload/format.ts — workload number formatting (SPEC §8.8, FR-1002, M9-D6/D7). Isomorphic, pure; cd in,
// strings out (no float arithmetic: formatCd does integer half-up rounding).
import type { Cd } from '@/domain/types'
import { formatCd } from '@/domain/units'
import type { WorkloadCell } from '@/lib/contracts/workload'
import { th } from '@/i18n/th'

/** 1 decimal half-up via formatCd, trailing ".0" removed: 500 → "5", 375 → "3.8", 35 → "0.4"; 0 → "0". */
export function compactDays(cd: Cd): string {
  const text = formatCd(cd, { unit: 'DAYS', decimals: 1 })
  if (text === '') return '0'
  const compact = text.endsWith('.0') ? text.slice(0, -2) : text
  return compact === '-0' ? '0' : compact
}

/** M9-D6: view load 0 → th.workload.cell.empty ('–'); else `${compactDays(load)}/${compactDays(cap)}`. */
export function workloadCellText(loadCd: Cd, capCd: Cd): string {
  if (loadCd === 0) return th.workload.cell.empty
  return `${compactDays(loadCd)}/${compactDays(capCd)}`
}

/** 2 decimals in days, exact (375 → "3.75"); 0 → "0.00". Tooltip, panel and list numbers. */
export function twoDecimals(cd: Cd): string {
  return cd === 0 ? '0.00' : formatCd(cd, { unit: 'DAYS', decimals: 2 })
}

/** Cause label of a non-OK week; deactivated weeks say "ปิดใช้งาน" instead (M9-D7, data unchanged). */
export function causeText(cause: WorkloadCell['cause'], deactivated: boolean): string {
  if (deactivated) return th.overload.cause.DEACTIVATED
  return cause === null ? '' : th.overload.cause[cause]
}

/** Visually hidden status suffix for aria: '' for OK, else th.overload.weekStatus(level, excess, cause). */
export function statusSuffix(
  cell: Pick<WorkloadCell, 'level' | 'excess' | 'cause'>,
  opts: { deactivated: boolean },
): string {
  if (cell.level === 'OK') return ''
  return th.overload.weekStatus(
    th.overload.level[cell.level],
    th.overload.excess(twoDecimals(cell.excess)),
    causeText(cell.cause, opts.deactivated),
  )
}
