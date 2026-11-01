// src/server/services/day-context.ts — the one server source of per-day context (M7-D19, M7-D25, C18; m09 S2 reuses
// loadDayData). The grid service and the save/planRange services both build `DayCtx` through
// src/lib/grid/day.ts#dayCtxFor — the same function the client applies to the grid response — so derived day values,
// BR-22 previews and what `save` writes agree (contract test grid-day-parity.int.test.ts). Integer cd; ISO dates;
// never reads the clock (X56).
import type { DayCtx } from '@/domain/allocation'
import { capacityByDay } from '@/domain/capacity'
import { addDays, daysOfWeek } from '@/domain/dates'
import type { Cd, ISODate, PeriodKey } from '@/domain/types'
import { th } from '@/i18n/th'
import type { UserCapacity } from '@/lib/contracts/capacity'
import type { GridPerson, GridTimeOff } from '@/lib/contracts/grid'
import { dayCtxFor, dKey } from '@/lib/grid/day'
import type { DbOrTx } from '../db/types'
import * as repo from '../repo'
import { loadCapacityInputs } from './capacity'

export type DayData = Pick<GridPerson, 'capacity' | 'standard' | 'timeOff'>

/** D: capacity / standard keys of every day of `weeks` (zeros omitted; a missing key means 0 — M7-D19). Pure. */
export function dayKeysFor(
  days: UserCapacity['days'] | undefined,
  weeks: Iterable<ISODate>,
): { capacity: Partial<Record<PeriodKey, Cd>>; standard: Partial<Record<PeriodKey, Cd>> } {
  const capacity: Partial<Record<PeriodKey, Cd>> = {}
  const standard: Partial<Record<PeriodKey, Cd>> = {}
  for (const w of weeks) {
    for (const d of daysOfWeek(w)) {
      const c = days?.[d]
      if (!c) continue
      if (c.capacityCd > 0) capacity[dKey(d)] = c.capacityCd
      if (c.standardCd > 0) standard[dKey(d)] = c.standardCd
    }
  }
  return { capacity, standard }
}

/** dayCtxFor reads only capacity / standard / timeOff; the other GridPerson fields are irrelevant to it. */
function asPerson(data: DayData | undefined): GridPerson | undefined {
  return data ? { name: '', active: true, deactivatedOn: null, ...data } : undefined
}

/** DayCtx of one person's week from grid-shaped data (the client's computation, M7-D25). */
export function dayCtxOf(data: DayData | undefined, week: ISODate): DayCtx {
  return dayCtxFor(asPerson(data), week)
}

/**
 * D: capacity/standard keys of `weeks` per user from M5's capacity inputs (one load over [min(weeks), max(weeks) + 7)),
 * plus the person's live time-off spans in that range (dates only matter; labels are masked — callers that serialise
 * leave use M6's maskTimeOff path). Unknown users are absent (→ dayCtxFor zeros, as M6's former week-context helper did).
 */
export async function loadDayData(
  tx: DbOrTx,
  userIds: readonly string[],
  weeks: readonly ISODate[],
): Promise<Map<string, DayData>> {
  const out = new Map<string, DayData>()
  const sorted = [...new Set(weeks)].sort()
  if (sorted.length === 0 || userIds.length === 0) return out
  const from = sorted[0]!
  const to = addDays(sorted[sorted.length - 1]!, 7)
  const inputs = await loadCapacityInputs(tx, userIds, { from, to })
  const spans = await repo.timeOff.listSpans(tx, [...inputs.users.keys()], from, to)
  const leaveBy = new Map<string, GridTimeOff[]>()
  for (const s of spans) {
    const list = leaveBy.get(s.userId) ?? []
    list.push({ start: s.startDate, end: s.endDate, half: s.half, label: th.masking.leave })
    leaveBy.set(s.userId, list)
  }
  for (const [id, u] of inputs.users) {
    const days = capacityByDay(
      {
        schedule: u.schedule,
        holidays: inputs.holidays,
        timeOff: u.timeOff,
        deactivatedOn: u.deactivatedOn,
      },
      from,
      to,
    )
    out.set(id, { ...dayKeysFor(days, sorted), timeOff: leaveBy.get(id) ?? [] })
  }
  return out
}

/** DayCtx per (user, week) = dayCtxFor applied to loadDayData's output. Same signature as M6's former
 *  services/allocations.ts week-context helper (C18, deleted); save() and planRange() call this. */
export async function loadDayCtx(
  tx: DbOrTx,
  userIds: readonly string[],
  weeks: readonly ISODate[],
): Promise<Map<string, Map<ISODate, DayCtx>>> {
  const out = new Map<string, Map<ISODate, DayCtx>>()
  const sorted = [...new Set(weeks)].sort()
  if (sorted.length === 0 || userIds.length === 0) return out
  const data = await loadDayData(tx, userIds, sorted)
  for (const userId of new Set(userIds)) {
    const d = data.get(userId)
    out.set(userId, new Map(sorted.map((w) => [w, dayCtxOf(d, w)])))
  }
  return out
}
