// src/lib/grid/tooltip.ts — cell marks and the one shared tooltip's content (FR-804/807/808, BR-20a, BR-50, M6-D9/D20,
// r5 M6-30). Pure; strings from th, dates through src/lib/format (both isomorphic).
import { countsTowardLoad } from '@/domain/completed'
import { addDays, compareISO, daysOfWeek, isoWeekday } from '@/domain/dates'
import { formatCd } from '@/domain/units'
import type { Cd, CellUnit, ISODate, LoadPair, PeriodKey } from '@/domain/types'
import type { GridMilestone, GridTimeOff } from '@/lib/contracts/grid'
import { th } from '@/i18n/th'
import { formatLeaveRange, formatThaiDate } from '@/lib/format'
import type { GridModel } from './merge'
import type { ViewRow } from './rows'
import { weekOfPeriodKey } from './totals'

const dayKeySets = new WeakMap<GridModel['periods'], Set<PeriodKey>>()
/** Whether the model holds the D: period (its day capacity is known, M7-D19). */
function hasPeriod(m: Pick<GridModel, 'periods'>, key: PeriodKey): boolean {
  let set = dayKeySets.get(m.periods)
  if (!set) dayKeySets.set(m.periods, (set = new Set(m.periods.map((p) => p.key))))
  return set.has(key)
}

/** Leave entries of a person that cover the date. */
export function leaveOnDate(timeOff: readonly GridTimeOff[], date: ISODate): GridTimeOff[] {
  return timeOff.filter((t) => compareISO(t.start, date) <= 0 && compareISO(t.end, date) >= 0)
}

/** Leave entries of a person that overlap the week [ws, ws + 6]. */
export function leaveInWeek(timeOff: readonly GridTimeOff[], week: ISODate): GridTimeOff[] {
  const last = addDays(week, 6)
  return timeOff.filter((t) => compareISO(t.start, last) <= 0 && compareISO(t.end, week) >= 0)
}

/** Holiday names inside the week, in date order. */
export function holidaysInWeek(m: Pick<GridModel, 'holidays'>, week: ISODate): string[] {
  const out: string[] = []
  for (const d of daysOfWeek(week)) {
    const n = m.holidays.get(d)
    if (n !== undefined) out.push(n)
  }
  return out
}

export interface CellMarks {
  leave: boolean
  noCapacity: boolean
  notCounted: boolean
  tentative: boolean
}

/** M7: on a D: key `leave` = leave covers that date and `noCapacity` = the loaded day has capacity 0. */
export function cellMarks(m: GridModel, row: ViewRow, key: PeriodKey): CellMarks {
  const week = weekOfPeriodKey(key)
  const tentative = row.task.certainty === 'TENTATIVE'
  const notCounted = row.task.completedWeek !== null && !countsTowardLoad(week, row.task.completedWeek)
  if (row.kind === 'task') return { leave: false, noCapacity: false, notCounted, tentative }
  const person = m.people[row.assignee.userId]
  if (key.startsWith('D:')) {
    const date = key.slice(2)
    return {
      leave: person ? leaveOnDate(person.timeOff, date).length > 0 : false,
      noCapacity: hasPeriod(m, key) && (person?.capacity[key] ?? 0) === 0,
      notCounted,
      tentative,
    }
  }
  const loaded = m.loadedWeeks.has(week)
  return {
    leave: person ? leaveInWeek(person.timeOff, week).length > 0 : false,
    noCapacity: loaded && (person?.capacity[key] ?? 0) === 0,
    notCounted,
    tentative,
  }
}

const days2 = (cd: Cd) => formatCd(cd, { unit: 'DAYS', decimals: 2 }) || '0.00'

/** "จ 0.50 · อ 0.50" — non-empty days of a DAY week, 2 decimals. */
export function dayParts(days: Readonly<Record<ISODate, Cd>> | undefined): string {
  return Object.entries(days ?? {})
    .filter(([, cd]) => cd !== 0)
    .sort(([a], [b]) => compareISO(a, b))
    .map(([d, cd]) => `${th.calendar.weekdays[isoWeekday(d) - 1]} ${days2(cd)}`)
    .join(' · ')
}

/** Tooltip lines of a body cell: exact value (or the fraction formula), DAY parts, not-counted note, leave, holidays,
 *  no capacity. `totalCd` is the shown value of a task row. */
export function tooltipFor(
  row: ViewRow,
  key: PeriodKey,
  m: GridModel,
  o: { unit: CellUnit; totalCd?: Cd },
): string[] {
  if (key.startsWith('D:')) return dayTooltipFor(row, key, m, o)
  const week = key.slice(2)
  const lines: string[] = []
  const marks = cellMarks(m, row, key)
  if (row.kind === 'task') {
    const cd = o.totalCd ?? 0
    if (cd > 0) lines.push(th.grid.cell.exact(days2(cd)))
    if (marks.notCounted) lines.push(th.grid.cell.notCounted)
    for (const h of holidaysInWeek(m, week)) lines.push(th.grid.cell.holiday(h))
    return lines
  }
  const cell = m.cells.get(row.key)?.get(key)
  const person = m.people[row.assignee.userId]
  const cap = person?.capacity[key] ?? 0
  if (cell && cell.cd > 0) {
    if (o.unit === 'FRACTION' && cap > 0) {
      lines.push(
        th.units.fractionTooltip(
          formatCd(cell.cd, { unit: 'FRACTION', baseCd: cap, decimals: 2 }),
          days2(cap),
          days2(cell.cd),
        ),
      )
    } else lines.push(th.grid.cell.exact(days2(cell.cd)))
    if (cell.resolution === 'DAY') lines.push(th.grid.cell.dayTooltip(dayParts(cell.days)))
  }
  if (marks.notCounted) lines.push(th.grid.cell.notCounted)
  for (const t of leaveInWeek(person?.timeOff ?? [], week)) {
    lines.push(th.grid.cell.leave(t.label, formatLeaveRange(t.start, t.end, t.half)))
  }
  for (const h of holidaysInWeek(m, week)) lines.push(th.grid.cell.holiday(h))
  if (marks.noCapacity) lines.push(th.grid.cell.noCapacity)
  return lines
}

/** M9 person grid: a project / masked row cell = its exact total in 2 decimals (no names — the masked row never tells
 *  which projects it sums, §3.3). */
export function headerRowTooltipFor(load: LoadPair | undefined): string[] {
  return load && load.total > 0 ? [th.grid.cell.exact(days2(load.total))] : []
}

/** Header tooltip: "วันหยุด: …" when the week has holidays, else null. */
export function headerTooltipFor(m: Pick<GridModel, 'holidays'>, week: ISODate): string | null {
  const names = holidaysInWeek(m, week)
  return names.length > 0 ? th.grid.header.holiday(names.join(', ')) : null
}

/** Tooltip lines of a day cell (M7 S3.4/S3.10): derived (with the week total) or stored value in 2 decimals, warnings,
 *  BR-50 notes, leave / holiday of that date, no capacity. */
function dayTooltipFor(row: ViewRow, key: PeriodKey, m: GridModel, o: { unit: CellUnit; totalCd?: Cd }): string[] {
  const date = key.slice(2)
  const week = weekOfPeriodKey(key)
  const lines: string[] = []
  const marks = cellMarks(m, row, key)
  const completedHere = row.task.completedWeek !== null && row.task.completedWeek === week
  if (row.kind === 'task') {
    const cd = o.totalCd ?? 0
    if (cd > 0) lines.push(th.grid.cell.exact(days2(cd)))
  } else {
    const cell = m.cells.get(row.key)?.get(key)
    if (cell && cell.cd > 0) {
      if (cell.derived) {
        const weekCd = m.cells.get(row.key)?.get(`W:${week}`)?.cd ?? 0
        lines.push(th.grid.day.derivedTooltip(days2(cell.cd), days2(weekCd)))
      } else lines.push(th.grid.day.dayTooltip(days2(cell.cd)))
      if (cell.warn?.includes('NON_WORKING')) lines.push(th.grid.warn.nonWorkingDay)
      if (cell.warn?.includes('TIME_OFF')) lines.push(th.grid.warn.allocatedOnTimeOff(days2(cell.cd)))
    }
    for (const t of leaveOnDate(m.people[row.assignee.userId]?.timeOff ?? [], date))
      lines.push(th.grid.cell.leave(t.label, formatLeaveRange(t.start, t.end, t.half)))
  }
  if (marks.notCounted) lines.push(th.grid.cell.notCounted)
  else if (completedHere) lines.push(th.grid.day.completedWeekCounts)
  const h = m.holidays.get(date)
  if (h !== undefined) lines.push(th.grid.cell.holiday(h))
  if (marks.noCapacity) lines.push(th.grid.day.noCapacityDay)
  return lines
}

/** Header tooltip of a day column: "วันหยุด: …" on a holiday, else null. */
export function dayHeaderTooltipFor(m: Pick<GridModel, 'holidays'>, date: ISODate): string | null {
  const name = m.holidays.get(date)
  return name !== undefined ? th.grid.header.holiday(name) : null
}

/** Description excerpt length in the ◆ tooltip (plan/m08 S3.3). */
export const MILESTONE_TIP_DESCRIPTION_MAX = 200

/** Tooltip lines of a ◆ (M8 S3.3): name, date · status, progress, "เลย milestone N งาน" when late, description excerpt. */
export function milestoneTooltipFor(m: GridMilestone): string[] {
  const lines = [
    m.name,
    th.milestones.dateLine(formatThaiDate(m.date, 'medium'), th.milestones.status[m.status]),
    th.milestones.progress(m.progress.done, m.progress.total),
  ]
  if (m.late) lines.push(th.milestones.lateTasks(m.lateTaskCount))
  const d = m.description?.trim()
  if (d)
    lines.push(
      d.length > MILESTONE_TIP_DESCRIPTION_MAX ? `${d.slice(0, MILESTONE_TIP_DESCRIPTION_MAX)}…` : d,
    )
  return lines
}
