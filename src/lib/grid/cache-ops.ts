// src/lib/grid/cache-ops.ts — pure patches of cached grid chunks (SPEC §7.4, PLAN §3.10, X65). Applied to every
// chunk through setQueriesData(qk.gridAll(ctx)). A chunk only takes cells of its own periods; row fields that are
// chunk-independent (version, rowTotal) are patched in every chunk so the merged model stays consistent.
import { addLoad, splitLoad, ZERO_LOAD } from '@/domain/certainty'
import { countsTowardLoad } from '@/domain/completed'
import { weekStart } from '@/domain/dates'
import type { Cd, ISODate, LoadPair, PeriodKey } from '@/domain/types'
import type {
  AssigneeCell,
  GridAssigneeRow,
  GridResponse,
  GridRow,
  GridTaskRow,
  SaveAllocationsOk,
  SaveItemResult,
  WeekState,
} from '@/lib/contracts/grid'
import type { CellWrite } from './queue'

const weekOfWrite = (w: CellWrite): ISODate => (w.granularity === 'WEEK' ? w.period : weekStart(w.period))

/** The cell after applying the writes of one (assignment, week), in order. undefined = empty. */
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

function counted(cd: Cd, week: ISODate, task: GridTaskRow | undefined): LoadPair {
  if (!task || cd === 0 || !countsTowardLoad(week, task.completedWeek)) return ZERO_LOAD
  return splitLoad(cd, task.certainty)
}

function minus(a: LoadPair, b: LoadPair): LoadPair {
  return { total: a.total - b.total, committed: a.committed - b.committed }
}

/** Recomputes `totals[key]` of the given tasks and all their ancestors from the assignee cells of `rows`. */
function recomputeTotals(rows: GridRow[], taskIds: ReadonlySet<string>, keys: ReadonlySet<PeriodKey>): void {
  if (taskIds.size === 0 || keys.size === 0) return
  const idx = new Map<string, number>()
  rows.forEach((r, i) => {
    if (r.kind === 'task') idx.set(r.id, i)
  })
  const affected = new Set<string>()
  for (const id of taskIds) {
    let cur: string | null = id
    while (cur !== null && !affected.has(cur)) {
      affected.add(cur)
      const i = idx.get(cur)
      cur = i === undefined ? null : (rows[i] as GridTaskRow).parentId
    }
  }
  const sums = new Map<string, Partial<Record<PeriodKey, LoadPair>>>()
  const taskOf = new Map<string, GridTaskRow>()
  for (const r of rows) if (r.kind === 'task') taskOf.set(r.id, r)
  for (const r of rows) {
    if (r.kind !== 'assignee' || !affected.has(r.taskId)) continue
    const task = taskOf.get(r.taskId)
    if (!task || task.hasChildren) continue
    const rec = sums.get(task.id) ?? {}
    for (const key of keys) {
      const c = r.cells[key]
      if (!c) continue
      rec[key] = addLoad(rec[key] ?? ZERO_LOAD, counted(c.cd, key.slice(2), task))
    }
    sums.set(task.id, rec)
  }
  const childIdx = new Map<string, number[]>()
  rows.forEach((r, i) => {
    if (r.kind !== 'task' || r.parentId === null) return
    const list = childIdx.get(r.parentId)
    if (list) list.push(i)
    else childIdx.set(r.parentId, [i])
  })
  // depth-first order reversed: children are final before their parent sums them
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!
    if (r.kind !== 'task' || !affected.has(r.id)) continue
    const rec: Partial<Record<PeriodKey, LoadPair>> = {}
    if (r.hasChildren) {
      for (const ci of childIdx.get(r.id) ?? []) {
        const child = rows[ci] as GridTaskRow
        for (const key of keys) {
          const v = child.totals[key]
          if (v) rec[key] = addLoad(rec[key] ?? ZERO_LOAD, v)
        }
      }
    } else Object.assign(rec, sums.get(r.id))
    const totals = { ...r.totals }
    for (const key of keys) {
      const v = rec[key]
      if (v && (v.total !== 0 || v.committed !== 0)) totals[key] = v
      else delete totals[key]
    }
    rows[i] = { ...r, totals }
  }
}

/**
 * rowTotal deltas of a set of writes, computed against whichever chunk holds each week (counted load, BR-50 and the
 * task's certainty). Pass the result to applyWritesOptimistically so every chunk moves its rowTotal identically.
 */
export function rowTotalDeltas(
  chunks: readonly (GridResponse | undefined)[],
  writes: readonly CellWrite[],
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
      const after = nextCell(before, ws)
      const d = minus(counted(after?.cd ?? 0, week, task), counted(before?.cd ?? 0, week, task))
      out.set(taId, addLoad(out.get(taId) ?? ZERO_LOAD, d))
    }
  }
  return out
}

/**
 * Optimistic overlay (< 50 ms): WEEK writes set { cd, WEEK } (null/0 removes the cell); DAY writes set days of a
 * DAY week. Only cells of this chunk's periods change; task totals of touched tasks are recomputed. `deltas` (from
 * rowTotalDeltas over all chunks) moves rowTotal in every chunk; without it the delta is derived from this chunk.
 */
export function applyWritesOptimistically(
  resp: GridResponse,
  writes: readonly CellWrite[],
  deltas?: ReadonlyMap<string, LoadPair>,
): GridResponse {
  if (writes.length === 0) return resp
  const periods = new Set(resp.periods.map((p) => p.key))
  const grouped = groupWrites(writes)
  const ownDeltas = deltas ?? rowTotalDeltas([resp], writes)
  const rows = [...resp.rows]
  const taskOf = new Map<string, GridTaskRow>()
  for (const r of rows) if (r.kind === 'task') taskOf.set(r.id, r)
  const touchedTasks = new Set<string>()
  const touchedKeys = new Set<PeriodKey>()
  let changed = false
  rows.forEach((r, i) => {
    if (r.kind !== 'assignee') return
    const byWeek = grouped.get(r.taskAssignmentId)
    const delta = ownDeltas.get(r.taskAssignmentId)
    if (!byWeek && !delta) return
    let cells = r.cells
    for (const [week, ws] of byWeek ?? []) {
      const key: PeriodKey = `W:${week}`
      if (!periods.has(key)) continue
      if (cells === r.cells) cells = { ...r.cells }
      const next = nextCell(cells[key], ws)
      if (next) cells[key] = next
      else delete cells[key]
      touchedKeys.add(key)
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

/** Takes the whole SaveAllocationsOk so M8 applies `ok.lateness` here without a signature change (M8 S3.2):
 *  ok.results → cells of this chunk's periods, version and rowTotal in every chunk, task totals recomputed. */
export function applyServerResults(resp: GridResponse, ok: SaveAllocationsOk): GridResponse {
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
    for (const [week, state] of Object.entries(res.weeks)) {
      const key: PeriodKey = `W:${week}`
      if (!periods.has(key)) continue
      const c = cellFromState(state)
      if (c) cells[key] = c
      else delete cells[key]
      touchedKeys.add(key)
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
  return applyServerResults(resp, { results: [...current], warnings: [] })
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
