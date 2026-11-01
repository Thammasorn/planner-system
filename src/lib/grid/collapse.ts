// src/lib/grid/collapse.ts — BR-23 "↕ รวมเป็นรายสัปดาห์" as a client command (M7-D2): DAY weeks → WEEK writes equal to
// Σ days, sent with onDayWeekConflict 'COLLAPSE' through the normal save pipeline (no new server action). Pure.
import type { ISODate } from '@/domain/types'
import type { GridModel } from './merge'
import type { CellWrite } from './queue'

export interface CollapseTarget {
  taskAssignmentId: string
  week: ISODate
}

/** One WEEK write per DAY (assignment, week) target; WEEK / empty / unknown targets are ignored. */
export function collapseChanges(targets: readonly CollapseTarget[], model: GridModel): CellWrite[] {
  const seen = new Set<string>()
  const out: CellWrite[] = []
  for (const t of targets) {
    const k = `${t.taskAssignmentId}|${t.week}`
    if (seen.has(k)) continue
    seen.add(k)
    const cell = model.cells.get(`a:${t.taskAssignmentId}`)?.get(`W:${t.week}`)
    if (!cell || cell.resolution !== 'DAY' || cell.cd === 0) continue
    out.push({ taskAssignmentId: t.taskAssignmentId, granularity: 'WEEK', period: t.week, cd: cell.cd })
  }
  return out
}

/** The DAY (assignment, week) pairs of a set of cells (row = assignment, period = W:/D: key) — the CellMenu targets. */
export function dayTargetsOf(
  cells: readonly { taskAssignmentId: string | null; week: ISODate }[],
  model: GridModel,
): CollapseTarget[] {
  const seen = new Set<string>()
  const out: CollapseTarget[] = []
  for (const c of cells) {
    if (c.taskAssignmentId === null) continue
    const k = `${c.taskAssignmentId}|${c.week}`
    if (seen.has(k)) continue
    seen.add(k)
    const cell = model.cells.get(`a:${c.taskAssignmentId}`)?.get(`W:${c.week}`)
    if (cell?.resolution === 'DAY' && cell.cd > 0) out.push({ taskAssignmentId: c.taskAssignmentId, week: c.week })
  }
  return out
}
