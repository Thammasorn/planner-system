// src/lib/grid/day.ts — shared pure day model of the planning grid (M7-D1, M7-D9, M7-D10, M7-D19, M7-D27).
// Used by services/grid.ts (server) and the PlanGrid client, so derived day values are computed once.
// Imports src/domain/** and src/lib/contracts/** only; integer cd, ISODate strings, no Date.
import { displayDays, spreadWeek, type DayCtx, type WeekPlan } from '@/domain/allocation'
import { compareISO, daysOfWeek, isoWeekday } from '@/domain/dates'
import type { Cd, ISODate, LoadPair, PeriodKey, Weekday } from '@/domain/types'
import type { AssigneeCell, DayLoadRow, DayWarn, GridPerson, WeekState } from '@/lib/contracts/grid'

export const wKey = (week: ISODate): PeriodKey => `W:${week}`
export const dKey = (date: ISODate): PeriodKey => `D:${date}`

const NULL_PLAN: WeekPlan = Object.freeze({ resolution: null })

function sum(xs: readonly number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s
}

/** Days7 from a { date: cd } record of one week (missing = 0). */
function daysFromRecord(days: Record<ISODate, Cd> | undefined, week: ISODate): Cd[] {
  return daysOfWeek(week).map((d) => days?.[d] ?? 0)
}

/** { date: cd } of the non-zero days. */
function recordFromDays(days: readonly Cd[], week: ISODate): Record<ISODate, Cd> {
  const out: Record<ISODate, Cd> = {}
  daysOfWeek(week).forEach((d, i) => {
    if (days[i]! > 0) out[d] = days[i]!
  })
  return out
}

function planOf(resolution: 'WEEK' | 'DAY' | null, cd: Cd, days: Record<ISODate, Cd> | undefined, week: ISODate): WeekPlan {
  if (resolution === 'WEEK') return cd > 0 ? { resolution: 'WEEK', weekCd: cd } : NULL_PLAN
  if (resolution === 'DAY') {
    const ds = daysFromRecord(days, week)
    return sum(ds) > 0 ? { resolution: 'DAY', days: ds } : NULL_PLAN
  }
  return NULL_PLAN
}

/** Missing D: keys = 0. timeOff[i] = true when any of person.timeOff covers that date (AM/PM included). */
export function dayCtxFor(person: GridPerson | undefined, week: ISODate): DayCtx {
  const dates = daysOfWeek(week)
  return {
    week,
    dayCaps: dates.map((d) => person?.capacity[dKey(d)] ?? 0),
    schedule: dates.map((d) => person?.standard[dKey(d)] ?? 0),
    timeOff: dates.map((d) => (person?.timeOff ?? []).some((t) => compareISO(t.start, d) <= 0 && compareISO(d, t.end) <= 0)),
  }
}

/** The plan behind a W: cell (DAY uses cell.days). */
export function weekPlanFromCell(cell: AssigneeCell | undefined, week: ISODate): WeekPlan {
  return cell ? planOf(cell.resolution, cell.cd, cell.days, week) : NULL_PLAN
}

export function weekPlanFromState(state: WeekState | undefined, week: ISODate): WeekPlan {
  return state ? planOf(state.resolution, state.cd, state.days, week) : NULL_PLAN
}

/** { cd, resolution, days? } — days only for DAY weeks, zeros omitted. */
export function weekStateFromPlan(plan: WeekPlan, week: ISODate): WeekState {
  if (plan.resolution === 'WEEK') return { cd: plan.weekCd, resolution: 'WEEK' }
  if (plan.resolution === 'DAY') return { cd: sum(plan.days), resolution: 'DAY', days: recordFromDays(plan.days, week) }
  return { cd: 0, resolution: null }
}

/** W: cell for any week; fallback flag when WEEK cd > 0 and weekCapCd = 0 (weekStdCd > 0 ? 'SCHEDULE' : 'WEEKDAYS'). undefined for an empty week. */
export function weekCellFromPlan(plan: WeekPlan, week: ISODate, weekCapCd: Cd, weekStdCd: Cd): AssigneeCell | undefined {
  if (plan.resolution === 'WEEK') {
    if (plan.weekCd === 0) return undefined
    const cell: AssigneeCell = { cd: plan.weekCd, resolution: 'WEEK', derived: false }
    if (weekCapCd === 0) cell.fallback = weekStdCd > 0 ? 'SCHEDULE' : 'WEEKDAYS'
    return cell
  }
  if (plan.resolution === 'DAY') {
    const cd = sum(plan.days)
    return cd > 0 ? { cd, resolution: 'DAY', derived: false, days: recordFromDays(plan.days, week) } : undefined
  }
  return undefined
}

/** D: cells of one week: WEEK → spreadWeek values with derived: true; DAY → stored values, derived: false;
 *  warn NON_WORKING when cd > 0 && dayCaps[i] = 0, TIME_OFF when cd > 0 && timeOff[i]; zero days omitted. */
export function dayCellsFromPlan(plan: WeekPlan, ctx: DayCtx): Record<PeriodKey, AssigneeCell> {
  const out: Record<PeriodKey, AssigneeCell> = {}
  if (plan.resolution === null) return out
  const { days, derived } = displayDays(plan, ctx)
  daysOfWeek(ctx.week).forEach((date, i) => {
    const cd = days[i]!
    if (cd === 0) return
    const cell: AssigneeCell = { cd, resolution: plan.resolution, derived }
    const warn: DayWarn[] = []
    if (ctx.dayCaps[i] === 0) warn.push('NON_WORKING')
    if (ctx.timeOff[i] === true) warn.push('TIME_OFF')
    if (warn.length > 0) cell.warn = warn
    out[dKey(date)] = cell
  })
  return out
}

/** Mon–Fri always; Sat/Sun when some grid person is scheduled that weekday or a DAY row exists on that date (M7-D10). */
export function visibleDayDates(
  week: ISODate,
  opts: { scheduledWeekdays: ReadonlySet<Weekday>; dayRowDates: ReadonlySet<ISODate> },
): ISODate[] {
  return daysOfWeek(week).filter((d) => {
    const wd = isoWeekday(d)
    return wd <= 5 || opts.scheduledWeekdays.has(wd) || opts.dayRowDates.has(d)
  })
}

/** M7-D27 (reused by M9's person grid masked row): rows of repo.allocations.dayLoadsForProjects → D: LoadPairs per user.
 *  DAY rows count as stored; WEEK rows: spreadWeek(committedCd) + spreadWeek(totalCd − committedCd), summed per day; zeros omitted. */
export function spreadDayLoads(
  rows: readonly DayLoadRow[],
  ctxOf: (userId: string, week: ISODate) => DayCtx,
): Map<string, Partial<Record<PeriodKey, LoadPair>>> {
  const out = new Map<string, Partial<Record<PeriodKey, LoadPair>>>()
  const add = (userId: string, date: ISODate, total: Cd, committed: Cd): void => {
    if (total === 0 && committed === 0) return
    let loads = out.get(userId)
    if (!loads) {
      loads = {}
      out.set(userId, loads)
    }
    const key = dKey(date)
    const prev = loads[key]
    loads[key] = prev ? { total: prev.total + total, committed: prev.committed + committed } : { total, committed }
  }
  for (const r of rows) {
    if (r.granularity === 'DAY') {
      add(r.userId, r.periodStart, r.totalCd, r.committedCd)
      continue
    }
    const ctx = ctxOf(r.userId, r.weekStart)
    const committed = spreadWeek(r.committedCd, ctx).days
    const tentative = spreadWeek(r.totalCd - r.committedCd, ctx).days
    daysOfWeek(r.weekStart).forEach((d, i) => add(r.userId, d, committed[i]! + tentative[i]!, committed[i]!))
  }
  return out
}
