// src/lib/grid/cache-ops.ts — pure patches of cached grid chunks (SPEC §7.4, PLAN §3.10, X65). Applied to every
// chunk through setQueriesData(qk.gridAll(ctx)). A chunk only takes cells of its own periods; row fields that are
// chunk-independent (version, rowTotal) are patched in every chunk so the merged model stays consistent.
import { planWeek, weekPlanTotal, type DayCtx, type WeekChange, type WeekPlan } from '@/domain/allocation'
import { addLoad, ZERO_LOAD } from '@/domain/certainty'
import { diffDays, weekStart } from '@/domain/dates'
import type { Cd, ISODate, LoadPair, PeriodKey } from '@/domain/types'
import type {
  AssigneeCell,
  GridAssigneeRow,
  GridResponse,
  GridTaskRow,
  OnDayWeekConflict,
  SaveAllocationsOk,
  SaveItemResult,
  WeekState,
} from '@/lib/contracts/grid'
import { dayCtxFor, weekPlanFromCell, weekPlanFromState, wKey } from './day'
import { patchWeekCells } from './day-overlay'
import type { CellWrite } from './queue'
import { applyLateness } from './milestones'
import { counted, recomputeTotals } from './totals'

const weekOfWrite = (w: CellWrite): ISODate => (w.granularity === 'WEEK' ? w.period : weekStart(w.period))

/** The cell after applying the writes of one (assignment, week), in order, without day context (M6 snapshot replay;
 *  the grid overlay uses nextPlan). undefined = empty. */
export function nextCell(
  cell: AssigneeCell | undefined,
  writes: readonly CellWrite[],
): AssigneeCell | undefined {
  let cur = cell
  for (const w of writes) {
    if (w.granularity === 'WEEK') {
      cur = w.cd === null || w.cd === 0 ? undefined : { cd: w.cd, resolution: 'WEEK', derived: false }
      continue
    }
    // DAY write: M6 only replays complete DAY snapshots onto WEEK weeks (undo), so a WEEK cell restarts from empty days.
    const days: Record<ISODate, Cd> = cur?.resolution === 'DAY' ? { ...cur.days } : {}
    if (w.cd === null || w.cd === 0) delete days[w.period]
    else days[w.period] = w.cd
    const total = Object.values(days).reduce((a, b) => a + b, 0)
    cur = total === 0 ? undefined : { cd: total, resolution: 'DAY', derived: false, days }
  }
  return cur
}

export function cellFromState(s: WeekState): AssigneeCell | undefined {
  if (s.resolution === null || s.cd === 0) return undefined
  if (s.resolution === 'WEEK') return { cd: s.cd, resolution: 'WEEK', derived: false }
  return { cd: s.cd, resolution: 'DAY', derived: false, days: { ...s.days } }
}

/**
 * M7: the plan of one (assignment, week) after the writes, through the domain's planWeek with the same DayCtx the
 * server builds (M7-D19): BR-22 on day writes to a WEEK week, BR-24 with `choice`, BR-23 with 'COLLAPSE'. Writes are
 * applied in runs of one granularity (queued gestures may mix them, M7-D6); a run the domain refuses (needsChoice /
 * invalid) leaves the plan unchanged — the BR-24 dialog or the server's validation decides it.
 */
export function nextPlan(
  current: WeekPlan,
  week: ISODate,
  writes: readonly CellWrite[],
  ctx: DayCtx,
  choice?: OnDayWeekConflict,
): WeekPlan {
  let cur = current
  let i = 0
  while (i < writes.length) {
    const g = writes[i]!.granularity
    const run: WeekChange[] = []
    while (i < writes.length && writes[i]!.granularity === g) {
      const w = writes[i]!
      run.push(
        w.granularity === 'WEEK'
          ? { granularity: 'WEEK', cd: w.cd }
          : { granularity: 'DAY', dayIndex: diffDays(week, w.period), cd: w.cd },
      )
      i++
    }
    const r = planWeek(cur, run, ctx, choice)
    if (r.kind === 'ok') cur = r.next
  }
  return cur
}

function groupWrites(writes: readonly CellWrite[]): Map<string, Map<ISODate, CellWrite[]>> {
  const out = new Map<string, Map<ISODate, CellWrite[]>>()
  for (const w of writes) {
    let byWeek = out.get(w.taskAssignmentId)
    if (!byWeek) out.set(w.taskAssignmentId, (byWeek = new Map<ISODate, CellWrite[]>()))
    const week = weekOfWrite(w)
    const list = byWeek.get(week)
    if (list) list.push(w)
    else byWeek.set(week, [w])
  }
  return out
}

function minus(a: LoadPair, b: LoadPair): LoadPair {
  return { total: a.total - b.total, committed: a.committed - b.committed }
}

/**
 * rowTotal deltas of a set of writes, computed against whichever chunk holds each week (counted load, BR-50 and the
 * task's certainty). Pass the result to applyWritesOptimistically so every chunk moves its rowTotal identically.
 */
export function rowTotalDeltas(
  chunks: readonly (GridResponse | undefined)[],
  writes: readonly CellWrite[],
  choice?: OnDayWeekConflict,
): Map<string, LoadPair> {
  const out = new Map<string, LoadPair>()
  const grouped = groupWrites(writes)
  for (const [taId, byWeek] of grouped) {
    for (const [week, ws] of byWeek) {
      const key: PeriodKey = `W:${week}`
      const chunk = chunks.find((c) => c?.periods.some((p) => p.key === key))
      if (!chunk) continue
      const row = chunk.rows.find(
        (r): r is GridAssigneeRow => r.kind === 'assignee' && r.taskAssignmentId === taId,
      )
      if (!row) continue
      const task = chunk.rows.find((r): r is GridTaskRow => r.kind === 'task' && r.id === row.taskId)
      const before = row.cells[key]
      const after = nextPlan(weekPlanFromCell(before, week), week, ws, dayCtxFor(chunk.people[row.userId], week), choice)
      const d = minus(counted(weekPlanTotal(after), week, task), counted(before?.cd ?? 0, week, task))
      out.set(taId, addLoad(out.get(taId) ?? ZERO_LOAD, d))
    }
  }
  return out
}

/**
 * Optimistic overlay (< 50 ms): per touched (assignment, week) the next plan (nextPlan: WEEK / DAY / BR-22 / BR-23 /
 * BR-24 with `choice`) patches the W: cell and, for weeks this chunk shows expanded, the D: cells. Task totals of
 * touched tasks are recomputed. `deltas` (from rowTotalDeltas over all chunks) moves rowTotal in every chunk; without
 * it the delta is derived from this chunk.
 */
export function applyWritesOptimistically(
  resp: GridResponse,
  writes: readonly CellWrite[],
  deltas?: ReadonlyMap<string, LoadPair>,
  choice?: OnDayWeekConflict,
): GridResponse {
  if (writes.length === 0) return resp
  const periods = new Set(resp.periods.map((p) => p.key))
  const grouped = groupWrites(writes)
  const ownDeltas = deltas ?? rowTotalDeltas([resp], writes, choice)
  const rows = [...resp.rows]
  const touchedTasks = new Set<string>()
  const touchedKeys = new Set<PeriodKey>()
  let changed = false
  rows.forEach((r, i) => {
    if (r.kind !== 'assignee') return
    const byWeek = grouped.get(r.taskAssignmentId)
    const delta = ownDeltas.get(r.taskAssignmentId)
    if (!byWeek && !delta) return
    let cells = r.cells
    const person = resp.people[r.userId]
    for (const [week, ws] of byWeek ?? []) {
      const key = wKey(week)
      if (!periods.has(key)) continue
      if (cells === r.cells) cells = { ...r.cells }
      const next = nextPlan(weekPlanFromCell(cells[key], week), week, ws, dayCtxFor(person, week), choice)
      for (const k of patchWeekCells(cells, resp, person, week, next)) touchedKeys.add(k)
      touchedTasks.add(r.taskId)
    }
    const rowTotal = delta ? addLoad(r.rowTotal, delta) : r.rowTotal
    if (cells !== r.cells || rowTotal !== r.rowTotal) {
      rows[i] = { ...r, cells, rowTotal }
      changed = true
    }
  })
  if (!changed) return resp
  recomputeTotals(rows, touchedTasks, touchedKeys)
  return { ...resp, rows }
}

/** Takes the whole SaveAllocationsOk (M8 S3.2): ok.results → cells of this chunk's periods, version and rowTotal in
 *  every chunk, task totals recomputed; then ok.lateness (M8-D12) → task rows' lateForMilestone and ◆ late flags. */
export function applyServerResults(resp: GridResponse, ok: SaveAllocationsOk): GridResponse {
  return applyLateness(applyResults(resp, ok), ok.lateness)
}

function applyResults(resp: GridResponse, ok: SaveAllocationsOk): GridResponse {
  if (ok.results.length === 0) return resp
  const byId = new Map(ok.results.map((r) => [r.taskAssignmentId, r]))
  const periods = new Set(resp.periods.map((p) => p.key))
  const rows = [...resp.rows]
  const touchedTasks = new Set<string>()
  const touchedKeys = new Set<PeriodKey>()
  let changed = false
  rows.forEach((r, i) => {
    if (r.kind !== 'assignee') return
    const res = byId.get(r.taskAssignmentId)
    if (!res) return
    const cells = { ...r.cells }
    const person = resp.people[r.userId]
    for (const [week, state] of Object.entries(res.weeks)) {
      if (!periods.has(wKey(week))) continue
      for (const k of patchWeekCells(cells, resp, person, week, weekPlanFromState(state, week))) touchedKeys.add(k)
      touchedTasks.add(r.taskId)
    }
    rows[i] = { ...r, cells, version: res.version, rowTotal: res.rowTotal }
    changed = true
  })
  if (!changed) return resp
  recomputeTotals(rows, touchedTasks, touchedKeys)
  return { ...resp, rows }
}

/** VERSION_CONFLICT: the server's current states replace the cached ones. */
export function applyConflicts(resp: GridResponse, current: readonly SaveItemResult[]): GridResponse {
  return applyServerResults(resp, { results: [...current], warnings: [], lateness: null })
}

/** The cached cell of (assignment, week) in whichever chunk holds that week. */
export function cachedCell(
  chunks: readonly (GridResponse | undefined)[],
  taskAssignmentId: string,
  week: ISODate,
): AssigneeCell | undefined {
  const key: PeriodKey = `W:${week}`
  for (const c of chunks) {
    if (!c?.periods.some((p) => p.key === key)) continue
    const row = c.rows.find(
      (r): r is GridAssigneeRow => r.kind === 'assignee' && r.taskAssignmentId === taskAssignmentId,
    )
    return row?.cells[key]
  }
  return undefined
}
