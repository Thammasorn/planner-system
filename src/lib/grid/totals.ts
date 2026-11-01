// src/lib/grid/totals.ts — counted load of a cell and the task-row totals recompute shared by the cache patches
// (cache-ops.ts, day-overlay.ts). BR-37 certainty split, BR-50 per week (a D: key counts by its week, M7-D14). Pure.
import { addLoad, splitLoad, ZERO_LOAD } from '@/domain/certainty'
import { countsTowardLoad } from '@/domain/completed'
import { weekStart } from '@/domain/dates'
import type { Cd, ISODate, LoadPair, PeriodKey } from '@/domain/types'
import type { GridRow, GridTaskRow } from '@/lib/contracts/grid'

/** W:<Monday> → Monday; D:<date> → its Monday. */
export function weekOfPeriodKey(key: PeriodKey): ISODate {
  const d = key.slice(2)
  return key.startsWith('D:') ? weekStart(d) : d
}

export function counted(cd: Cd, week: ISODate, task: GridTaskRow | undefined): LoadPair {
  if (!task || cd === 0 || !countsTowardLoad(week, task.completedWeek)) return ZERO_LOAD
  return splitLoad(cd, task.certainty)
}

/** Recomputes `totals[key]` of the given tasks and all their ancestors from the assignee cells of `rows` (in place). */
export function recomputeTotals(rows: GridRow[], taskIds: ReadonlySet<string>, keys: ReadonlySet<PeriodKey>): void {
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
      rec[key] = addLoad(rec[key] ?? ZERO_LOAD, counted(c.cd, weekOfPeriodKey(key), task))
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
