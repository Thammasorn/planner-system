// src/lib/grid/rows.ts — the visible row model (FR-805, SPEC §8.3, M6-D11/D12/D33). Pure.
import type { AssigneeCell, GridAssigneeRow, GridTaskRow } from '@/lib/contracts/grid'
import type { GridModel } from './merge'

export type RowKey = `t:${string}` | `a:${string}`

export type ViewRow =
  /** ≥ 2 assignees, 0 assignees or a parent */
  | { key: `t:${string}`; kind: 'task'; task: GridTaskRow; depth: number; collapsed: boolean }
  /** leaf with exactly 1 assignee (§8.3: merged into its task row) */
  | { key: `a:${string}`; kind: 'merged'; task: GridTaskRow; assignee: GridAssigneeRow; depth: number }
  | { key: `a:${string}`; kind: 'assignee'; task: GridTaskRow; assignee: GridAssigneeRow; depth: number }

export function rowKeyOfTask(id: string): `t:${string}` {
  return `t:${id}`
}
export function rowKeyOfAssignment(id: string): `a:${string}` {
  return `a:${id}`
}

/**
 * Depth-first rows from the response. A completed task is hidden when `showCompleted` is false unless something in its
 * subtree is still open (M3-D6); collapsed parents hide their descendants (in memory, M3-D19).
 */
export function buildViewRows(
  m: GridModel,
  o: { showCompleted: boolean; collapsed: ReadonlySet<string> },
): ViewRow[] {
  const tasks: GridTaskRow[] = []
  const assigneesOf = new Map<string, GridAssigneeRow[]>()
  for (const r of m.rows) {
    if (r.kind === 'task') tasks.push(r)
    else {
      const list = assigneesOf.get(r.taskId)
      if (list) list.push(r)
      else assigneesOf.set(r.taskId, [r])
    }
  }
  const childrenOf = new Map<string, GridTaskRow[]>()
  for (const t of tasks) {
    if (t.parentId === null) continue
    const list = childrenOf.get(t.parentId)
    if (list) list.push(t)
    else childrenOf.set(t.parentId, [t])
  }
  const allDone = new Map<string, boolean>()
  const subtreeDone = (t: GridTaskRow): boolean => {
    const cached = allDone.get(t.id)
    if (cached !== undefined) return cached
    const v = t.completed && (childrenOf.get(t.id) ?? []).every(subtreeDone)
    allDone.set(t.id, v)
    return v
  }
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const hiddenByAncestor = (t: GridTaskRow): boolean => {
    let p = t.parentId === null ? undefined : byId.get(t.parentId)
    while (p) {
      if (o.collapsed.has(p.id)) return true
      if (!o.showCompleted && subtreeDone(p)) return true
      p = p.parentId === null ? undefined : byId.get(p.parentId)
    }
    return false
  }

  const out: ViewRow[] = []
  for (const t of tasks) {
    if (!o.showCompleted && subtreeDone(t)) continue
    if (hiddenByAncestor(t)) continue
    const list = t.hasChildren ? [] : (assigneesOf.get(t.id) ?? [])
    const only = list.length === 1 ? list[0] : undefined
    if (only) {
      out.push({
        key: rowKeyOfAssignment(only.taskAssignmentId),
        kind: 'merged',
        task: t,
        assignee: only,
        depth: t.depth,
      })
      continue
    }
    out.push({
      key: rowKeyOfTask(t.id),
      kind: 'task',
      task: t,
      depth: t.depth,
      collapsed: o.collapsed.has(t.id),
    })
    for (const a of list) {
      out.push({
        key: rowKeyOfAssignment(a.taskAssignmentId),
        kind: 'assignee',
        task: t,
        assignee: a,
        depth: t.depth + 1,
      })
    }
  }
  return out
}

export type Editability = 'ok' | 'readOnlyRow' | 'unassigned' | 'archived' | 'dayWeek' | 'noEdit'

/**
 * M6-D11. Order: archived (banner) → noEdit (context.canEdit false or the row is not editable) → readOnlyRow /
 * unassigned → dayWeek → ok. (An archived project always has canEdit false, so `archived` is checked first to give
 * the more specific reason.) Completed tasks and deactivated assignees stay editable.
 */
export function cellEditability(row: ViewRow, cell: AssigneeCell | undefined, m: GridModel): Editability {
  if (m.context.archived) return 'archived'
  if (!m.context.canEdit) return 'noEdit'
  if (row.kind === 'task')
    return row.task.hasChildren || row.task.assigneeCount > 0 ? 'readOnlyRow' : 'unassigned'
  if (!row.assignee.editable) return 'noEdit'
  if (cell?.resolution === 'DAY') return 'dayWeek'
  return 'ok'
}
