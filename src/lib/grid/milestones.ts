// src/lib/grid/milestones.ts — the pure ◆ model of the plan grid (SPEC FR-705/707, AC-701, FR-820, D24; plan/m08 S3.1,
// M8-D8/D9/D10/D11/D12, X66). Placement: W:<weekStart(date)>, or D:<date> when that day column is shown (expanded week /
// day zoom), falling back to the week's "รวม" column. Columns are located only through columnIndexOfPeriod; day vs
// week is read from the key prefix. Cache patches return the same object when nothing changes.
import { compareMilestones, dateInWeekKeepingWeekday } from '@/domain/milestone'
import { weekStart } from '@/domain/dates'
import type { ISODate, PeriodKey } from '@/domain/types'
import type { GridMilestone, GridResponse, GridRow } from '@/lib/contracts/grid'
import type { MilestoneLateness } from '@/lib/contracts/milestones'
import type { GridMarkerView } from '@/lib/contracts/plan-markers'
import { columnIndexOfPeriod, type GridColumn } from './columns'

/** D:<date> when that day column exists (expanded week / day zoom), else W:<weekStart(date)>; null when outside the timeline. */
export function milestoneColumnKey(date: ISODate, cols: readonly GridColumn[]): PeriodKey | null {
  const day: PeriodKey = `D:${date}`
  if (columnIndexOfPeriod(cols, day) >= 0) return day
  const week: PeriodKey = `W:${weekStart(date)}`
  return columnIndexOfPeriod(cols, week) >= 0 ? week : null
}

/** column index → milestones in that column, sorted by compareMilestones (S1). Milestones outside the timeline are dropped. */
export function placeMilestones(
  ms: readonly GridMilestone[],
  cols: readonly GridColumn[],
): Map<number, GridMilestone[]> {
  const out = new Map<number, GridMilestone[]>()
  for (const m of [...ms].sort(compareMilestones)) {
    const key = milestoneColumnKey(m.date, cols)
    if (key === null) continue
    const i = columnIndexOfPeriod(cols, key)
    const list = out.get(i)
    if (list) list.push(m)
    else out.set(i, [m])
  }
  return out
}

/** Drop target → new date: D: column → its date; W: (week or "รวม") column → same weekday in that week. */
export function dateForDrop(orig: ISODate, col: GridColumn): ISODate {
  if (col.key.startsWith('D:')) return col.date
  return dateInWeekKeepingWeekday(orig, col.weekStart)
}

/** Click on an empty ◆-row cell → pre-filled date: D: → its date; W: → its weekStart (Monday). */
export function dateForCellClick(col: GridColumn): ISODate {
  return col.key.startsWith('D:') ? col.date : col.weekStart
}

/** Column under an x offset measured from the start of the scrollable timeline (binary search on col.offset);
 *  clamped to the first / last column, −1 without columns. */
export function columnAtX(cols: readonly GridColumn[], x: number): number {
  if (cols.length === 0) return -1
  let lo = 0
  let hi = cols.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cols[mid]!.offset <= x) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** The list with `m` in date-then-id order (an existing entry with the same id is replaced). */
export function sortedInsert(list: readonly GridMilestone[], m: GridMilestone): GridMilestone[] {
  return [...list.filter((x) => x.id !== m.id), m].sort(compareMilestones)
}

export type MilestoneGridPatch = Partial<Pick<GridMilestone, 'name' | 'date' | 'completedOn' | 'status'>>

export function applyMilestonePatch(r: GridResponse, id: string, patch: MilestoneGridPatch): GridResponse {
  const cur = r.milestones.find((m) => m.id === id)
  if (!cur) return r
  return { ...r, milestones: sortedInsert(r.milestones, { ...cur, ...patch }) }
}

export function removeMilestone(r: GridResponse, id: string): GridResponse {
  if (!r.milestones.some((m) => m.id === id)) return r
  return { ...r, milestones: r.milestones.filter((m) => m.id !== id) }
}

/** M8-D12: task rows' lateForMilestone + ◆ late / lateTaskCount from a save result; others untouched. */
export function applyLateness(r: GridResponse, l: MilestoneLateness | null | undefined): GridResponse {
  if (!l) return r
  const tasks = new Map(l.tasks.map((t) => [t.taskId, t.lateForMilestone]))
  const marks = new Map(l.milestones.map((m) => [m.id, m]))
  let rowsChanged = false
  const rows = r.rows.map((x): GridRow => {
    if (x.kind !== 'task') return x
    const late = tasks.get(x.id)
    if (late === undefined || late === x.lateForMilestone) return x
    rowsChanged = true
    return { ...x, lateForMilestone: late }
  })
  let msChanged = false
  const milestones = r.milestones.map((m) => {
    const n = marks.get(m.id)
    if (!n || (n.late === m.late && n.lateTaskCount === m.lateTaskCount)) return m
    msChanged = true
    return { ...m, late: n.late, lateTaskCount: n.lateTaskCount }
  })
  if (!rowsChanged && !msChanged) return r
  return { ...r, ...(rowsChanged ? { rows } : {}), ...(msChanged ? { milestones } : {}) }
}

/** FR-820 / D24: every milestone is also a dash-dot line in the marker layer (BR-102 edge of its ◆'s column); not
 *  interactive — edited through its ◆. Ids are prefixed so they never collide with plan-marker ids. */
export function milestoneMarkerViews(ms: readonly GridMilestone[]): GridMarkerView[] {
  return ms.map((m) => ({
    id: `ms:${m.id}`,
    source: 'MILESTONE',
    tone: 'MILESTONE',
    date: m.date,
    label: m.name,
    editable: false,
  }))
}
