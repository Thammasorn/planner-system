// src/server/services/home-leave.ts — the pure split of (already masked) leave entries into the home's three lines
// (SPEC §4.11 FR-1101d, M10-D16, X68). No DB, no request context; dates are ISODate strings (src/domain/dates.ts).
import { addDays, compareISO } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { compareThai } from '@/lib/collate'
import type { HomeLeave, HomeLeaveEntry } from '@/lib/contracts/home'

const overlaps = (e: HomeLeaveEntry, from: ISODate, toInclusive: ISODate): boolean =>
  compareISO(e.entry.startDate, toInclusive) <= 0 && compareISO(e.entry.endDate, from) >= 0

const byStartThenName = (a: HomeLeaveEntry, b: HomeLeaveEntry): number =>
  compareISO(a.entry.startDate, b.entry.startDate) ||
  compareThai(a.name, b.name) ||
  (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)

/** วันนี้ = covers today · สัปดาห์นี้ = overlaps [ws, ws+6] and not under วันนี้ · สัปดาห์หน้า = overlaps [ws+7, ws+13]. */
export function splitLeaveLines(entries: readonly HomeLeaveEntry[], today: ISODate, ws: ISODate): HomeLeave {
  const todayLine = entries.filter((e) => overlaps(e, today, today))
  const thisWeek = entries.filter((e) => !todayLine.includes(e) && overlaps(e, ws, addDays(ws, 6)))
  const nextWeek = entries.filter((e) => overlaps(e, addDays(ws, 7), addDays(ws, 13)))
  return {
    today: [...todayLine].sort(byStartThenName),
    thisWeek: [...thisWeek].sort(byStartThenName),
    nextWeek: [...nextWeek].sort(byStartThenName),
  }
}
