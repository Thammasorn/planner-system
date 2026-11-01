// src/lib/grid/tooltip.ts — cell marks and the one shared tooltip's content (FR-804/807/808, BR-20a, BR-50, M6-D9/D20,
// r5 M6-30). Pure; strings from th, dates through src/lib/format (both isomorphic).
import { countsTowardLoad } from '@/domain/completed'
import { addDays, compareISO, daysOfWeek, isoWeekday } from '@/domain/dates'
import { formatCd } from '@/domain/units'
import type { Cd, CellUnit, ISODate, PeriodKey } from '@/domain/types'
import type { GridTimeOff } from '@/lib/contracts/grid'
import { th } from '@/i18n/th'
import { formatLeaveRange } from '@/lib/format'
import type { GridModel } from './merge'
import type { ViewRow } from './rows'

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

export function cellMarks(m: GridModel, row: ViewRow, key: PeriodKey): CellMarks {
  const week = key.slice(2)
  const tentative = row.task.certainty === 'TENTATIVE'
  const notCounted = row.task.completedWeek !== null && !countsTowardLoad(week, row.task.completedWeek)
  if (row.kind === 'task') return { leave: false, noCapacity: false, notCounted, tentative }
  const person = m.people[row.assignee.userId]
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

/** Header tooltip: "วันหยุด: …" when the week has holidays, else null. */
export function headerTooltipFor(m: Pick<GridModel, 'holidays'>, week: ISODate): string | null {
  const names = holidaysInWeek(m, week)
  return names.length > 0 ? th.grid.header.holiday(names.join(', ')) : null
}
