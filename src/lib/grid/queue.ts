// src/lib/grid/queue.ts — client save batching (SPEC §7.4, X65, M6-D3). Pure.
import type { Cd, ISODate } from '@/domain/types'
import type { SaveAllocationsItem } from '@/lib/contracts/grid'

/** One cell write of a gesture. WEEK: period = Monday; DAY: period = the day. cd null (or 0) deletes. */
export interface CellWrite {
  taskAssignmentId: string
  granularity: 'WEEK' | 'DAY'
  period: ISODate
  cd: Cd | null
}

export function writeKey(w: Pick<CellWrite, 'taskAssignmentId' | 'granularity' | 'period'>): string {
  return `${w.taskAssignmentId}|${w.granularity}|${w.period}`
}

/** Last write wins per (assignment, granularity, period); each key keeps the position of its first write. */
export function coalesce(pending: readonly CellWrite[], next: readonly CellWrite[]): CellWrite[] {
  const out: CellWrite[] = []
  const at = new Map<string, number>()
  for (const w of [...pending, ...next]) {
    const k = writeKey(w)
    const i = at.get(k)
    const norm: CellWrite = { ...w, cd: w.cd === 0 ? null : w.cd }
    if (i === undefined) {
      at.set(k, out.length)
      out.push(norm)
    } else out[i] = norm
  }
  return out
}

/** Grouped per assignment (sorted by id, the server's lock order), changes in write order; versions read lazily. */
export function toItems(
  writes: readonly CellWrite[],
  versionOf: (id: string) => number,
): SaveAllocationsItem[] {
  const groups = new Map<string, SaveAllocationsItem['changes']>()
  for (const w of writes) {
    let list = groups.get(w.taskAssignmentId)
    if (!list) groups.set(w.taskAssignmentId, (list = []))
    list.push({ granularity: w.granularity, period: w.period, cd: w.cd === 0 ? null : w.cd })
  }
  return [...groups.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((id) => ({ taskAssignmentId: id, baseVersion: versionOf(id), changes: groups.get(id)! }))
}
