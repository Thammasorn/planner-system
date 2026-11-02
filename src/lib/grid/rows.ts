// src/lib/grid/rows.ts — the visible row model (FR-805, SPEC §8.3, M6-D11/D12/D33; M7.1 FR-816/817, BR-100/101,
// M7.1-D6). Pure.
import { viewLoad, ZERO_LOAD } from '@/domain/certainty'
import type { Cd, LoadView, PeriodKey } from '@/domain/types'
import type { AssigneeCell, GridAssigneeRow, GridTaskRow } from '@/lib/contracts/grid'
import type { GridModel } from './merge'

export type RowKey = `t:${string}` | `a:${string}`

export type ViewRow =
  /** ≥ 2 assignees, 0 assignees or a parent */
  | { key: `t:${string}`; kind: 'task'; task: GridTaskRow; depth: number; collapsed: boolean }
  /** leaf with exactly 1 assignee (§8.3: merged into its task row) */
  | { key: `a:${string}`; kind: 'merged'; task: GridTaskRow; assignee: GridAssigneeRow; depth: number }
  | { key: `a:${string}`; kind: 'assignee'; task: GridTaskRow; assignee: GridAssigneeRow; depth: number }

/** M7.1 (assignee column hidden, FR-816, M7.1-D6): one row per task; cells = task.totals (BR-100). `assignees` = []
 *  for parents. Kept out of `ViewRow` so the M6/M7 consumers keep compiling until S3 widens them to GridViewRow. */
export interface SumViewRow {
  key: `t:${string}`
  kind: 'sum'
  task: GridTaskRow
  assignees: GridAssigneeRow[]
  depth: number
  collapsed: boolean
}

/** Every row the grid can render (M7.1). */
export type GridViewRow = ViewRow | SumViewRow

export function rowKeyOfTask(id: string): `t:${string}` {
  return `t:${id}`
}
export function rowKeyOfAssignment(id: string): `a:${string}` {
  return `a:${id}`
}

/**
 * Depth-first rows from the response. A completed task is hidden when `showCompleted` is false unless something in its
 * subtree is still open (M3-D6); collapsed parents hide their descendants (in memory, M3-D19).
 * M7.1: `showAssignees: false` → one `sum` row per visible task instead (FR-816); true (default) = M6 output.
 */
export function buildViewRows(
  m: GridModel,
  o: { showCompleted: boolean; collapsed: ReadonlySet<string>; showAssignees?: true },
): ViewRow[]
export function buildViewRows(
  m: GridModel,
  o: { showCompleted: boolean; collapsed: ReadonlySet<string>; showAssignees?: boolean },
): GridViewRow[]
export function buildViewRows(
  m: GridModel,
  o: { showCompleted: boolean; collapsed: ReadonlySet<string>; showAssignees?: boolean },
): GridViewRow[] {
  const showAssignees = o.showAssignees ?? true
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

  const out: GridViewRow[] = []
  for (const t of tasks) {
    if (!o.showCompleted && subtreeDone(t)) continue
    if (hiddenByAncestor(t)) continue
    const list = t.hasChildren ? [] : (assigneesOf.get(t.id) ?? [])
    if (!showAssignees) {
      out.push({
        key: rowKeyOfTask(t.id),
        kind: 'sum',
        task: t,
        assignees: list,
        depth: t.depth,
        collapsed: o.collapsed.has(t.id),
      })
      continue
    }
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

export type Editability = 'ok' | 'readOnlyRow' | 'unassigned' | 'archived' | 'noEdit'
/** M7.1: + 'readOnlySum' (a summed cell of a parent or of ≥ 2 assignees, BR-101). */
export type SumEditability = Editability | 'readOnlySum'

/**
 * The assignment a write on this row goes to: merged / assignee rows → their own; a `sum` row of a leaf with exactly
 * one assignee → that one (BR-101, same path as a merged row); anything else (task rows, parents, ≥ 2 or 0 assignees)
 * → null. Never distributes a value over several assignees (SPEC D23).
 */
export function sumWriteTarget(row: GridViewRow): GridAssigneeRow | null {
  if (row.kind === 'merged' || row.kind === 'assignee') return row.assignee
  if (row.kind !== 'sum' || row.task.hasChildren || row.assignees.length !== 1) return null
  return row.assignees[0] ?? null
}

/** BR-100: the summed value of a task at `key` = its row `totals` (counted, BR-50) in the load view (BR-37). */
export function sumCell(row: GridViewRow, key: PeriodKey, view: LoadView): Cd {
  return viewLoad(row.task.totals[key] ?? ZERO_LOAD, view)
}

/**
 * M6-D11. Order: archived (banner) → noEdit (context.canEdit false or the row is not editable) → readOnlyRow /
 * unassigned → ok. M7.1: a `sum` row is 'ok' only through its single write target (sumWriteTarget, BR-101) — then
 * the target's `editable` decides — 'unassigned' for a leaf without assignees, else 'readOnlySum'. M7 (X27): DAY-resolution weeks are editable (BR-22/24), so `cell` no longer matters. (An archived project always has canEdit false, so `archived` is checked first to give
 * the more specific reason.) Completed tasks and deactivated assignees stay editable.
 */
export function cellEditability(row: ViewRow, cell: AssigneeCell | undefined, m: GridModel): Editability
export function cellEditability(row: GridViewRow, cell: AssigneeCell | undefined, m: GridModel): SumEditability
export function cellEditability(row: GridViewRow, cell: AssigneeCell | undefined, m: GridModel): SumEditability {
  if (m.context.archived) return 'archived'
  if (!m.context.canEdit) return 'noEdit'
  if (row.kind === 'sum') {
    const target = sumWriteTarget(row)
    if (target) return target.editable ? 'ok' : 'noEdit'
    return !row.task.hasChildren && row.assignees.length === 0 ? 'unassigned' : 'readOnlySum'
  }
  if (row.kind === 'task')
    return row.task.hasChildren || row.task.assigneeCount > 0 ? 'readOnlyRow' : 'unassigned'
  if (!row.assignee.editable) return 'noEdit'
  void cell // kept in the signature for later milestones (M9 masked rows)
  return 'ok'
}

/**
 * The row whose cells a grid row shows (M7.1-D6, S3.3): M6/M7 rows unchanged; a `sum` row with a single write target
 * (leaf, exactly one assignee — BR-101) behaves exactly like a merged row of that assignment (same cells, unit,
 * capacity, tooltip and write path, X65); any other `sum` row shows its task totals like a task row (BR-100).
 */
export function cellRowOf(row: GridViewRow): ViewRow {
  if (row.kind !== 'sum') return row
  const target = sumWriteTarget(row)
  if (target)
    return { key: rowKeyOfAssignment(target.taskAssignmentId), kind: 'merged', task: row.task, assignee: target, depth: row.depth }
  return { key: row.key, kind: 'task', task: row.task, depth: row.depth, collapsed: row.collapsed }
}

/** "👥 N" next to a summed task's name (FR-816): only for leaves with ≥ 2 assignees; null otherwise. */
export function sumPeopleCount(row: GridViewRow): number | null {
  return row.kind === 'sum' && !row.task.hasChildren && row.assignees.length >= 2 ? row.assignees.length : null
}
