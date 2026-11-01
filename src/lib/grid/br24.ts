// src/lib/grid/br24.ts — BR-24 "edit the total of a DAY week" conflicts in the client cache (SPEC §5.3 BR-24, §7.4,
// M7-D3/D4/D5). The dialog opens pre-emptively from these; the server's NEEDS_CHOICE is the authority (fallback).
// Pure.
import { daysOfWeek, weekStart } from '@/domain/dates'
import { scaleDays, type DayCtx, type Days7, type StepResult } from '@/domain/allocation'
import type { Cd, ISODate } from '@/domain/types'
import type { OnDayWeekConflict } from '@/lib/contracts/grid'
import type { GridModel } from './merge'
import type { CellWrite } from './queue'

export interface ConflictPair {
  taskAssignmentId: string
  week: ISODate
  fromCd: Cd
  toCd: Cd
  days: Days7
  userId: string
}

const keyOf = (taId: string, week: ISODate) => `${taId}|${week}`
const weekOfWrite = (w: CellWrite): ISODate => (w.granularity === 'WEEK' ? w.period : weekStart(w.period))

/** WEEK writes (last per week wins) whose week is DAY in the merged model, cd > 0 and cd ≠ Σ days. Deleting a DAY
 *  week (null / 0) or writing its current Σ are not conflicts (M7-D5). In write order. */
export function findDayWeekConflicts(writes: readonly CellWrite[], model: GridModel): ConflictPair[] {
  const last = new Map<string, CellWrite>()
  for (const w of writes) if (w.granularity === 'WEEK') last.set(keyOf(w.taskAssignmentId, w.period), w)
  const userOf = new Map<string, string>()
  for (const r of model.rows) if (r.kind === 'assignee') userOf.set(r.taskAssignmentId, r.userId)
  const out: ConflictPair[] = []
  for (const w of last.values()) {
    const cell = model.cells.get(`a:${w.taskAssignmentId}`)?.get(`W:${w.period}`)
    if (!cell || cell.resolution !== 'DAY') continue
    const toCd = w.cd ?? 0
    if (toCd === 0 || toCd === cell.cd) continue
    out.push({
      taskAssignmentId: w.taskAssignmentId,
      week: w.period,
      fromCd: cell.cd,
      toCd,
      days: daysOfWeek(w.period).map((d) => cell.days?.[d] ?? 0),
      userId: userOf.get(w.taskAssignmentId) ?? '',
    })
  }
  return out
}

/** Previews computed by the domain: SCALE → scaleDays (may spill); COLLAPSE → WEEK toCd. */
export function previewChoice(
  pair: ConflictPair,
  ctx: DayCtx,
  choice: OnDayWeekConflict,
): StepResult | { ok: true; weekCd: Cd } {
  if (choice === 'COLLAPSE') return { ok: true, weekCd: pair.toCd }
  return scaleDays(pair.days, pair.toCd, ctx)
}

/** Writes of the conflicting (assignment, week) pairs vs the rest, each in write order. */
export function splitByConflicts(
  writes: readonly CellWrite[],
  pairs: readonly Pick<ConflictPair, 'taskAssignmentId' | 'week'>[],
): { plain: CellWrite[]; conflicting: CellWrite[] } {
  const bad = new Set(pairs.map((p) => keyOf(p.taskAssignmentId, p.week)))
  const plain: CellWrite[] = []
  const conflicting: CellWrite[] = []
  for (const w of writes) (bad.has(keyOf(w.taskAssignmentId, weekOfWrite(w))) ? conflicting : plain).push(w)
  return { plain, conflicting }
}
