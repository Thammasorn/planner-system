// src/lib/grid/rows.ts — the visible row model (FR-805, SPEC §8.3, M6-D11/D12/D33; M7.1 FR-816/817, BR-100/101,
// M7.1-D6; M9 person context: project / masked rows, always-merged task rows, M9-D12/D28). Pure.
import { viewLoad, ZERO_LOAD } from '@/domain/certainty'
import type { Cd, LoadView, PeriodKey } from '@/domain/types'
import type {
  AssigneeCell,
  GridAssigneeRow,
  GridMaskedRow,
  GridProjectRow,
  GridRow,
  GridTaskRow,
} from '@/lib/contracts/grid'
import type { GridModel } from './merge'

/** M9 (X85): + `p:<projectId>` (person-context project header rows) and `m:<userId>` (the masked row). */
export type RowKey = `t:${string}` | `a:${string}` | `p:${string}` | `m:${string}`

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

/** Every row the project grid can render (M7.1). */
export type GridViewRow = ViewRow | SumViewRow

/** M9 person context (M9-D12): one read-only header row per visible project (collapsible, in memory, keyed `p:`). */
export interface ProjectViewRow {
  key: `p:${string}`
  kind: 'project'
  project: GridProjectRow
  depth: 0
  collapsed: boolean
}
/** M9 person context (SPEC §7.4): Σ of the projects the viewer may not see — read-only, no ids / names. */
export interface MaskedViewRow {
  key: `m:${string}`
  kind: 'masked'
  masked: GridMaskedRow
  depth: 0
}
/** Rows of the person context without a task (always read-only). */
export type PersonHeaderRow = ProjectViewRow | MaskedViewRow
/** A row of the person grid: header rows + merged task rows (M9-D12). */
export type PersonViewRow = PersonHeaderRow | ViewRow
/** Every row PlanGrid renders in either context. */
export type AnyViewRow = GridViewRow | PersonHeaderRow
/** The row whose cells a rendered row shows (cellRowOf). */
export type CellRow = ViewRow | PersonHeaderRow

/** A row that carries a task (M6–M7.1 kinds) — i.e. not a person-context project / masked row. */
export function isTaskViewRow<R extends AnyViewRow>(r: R): r is Exclude<R, PersonHeaderRow> {
  return r.kind !== 'project' && r.kind !== 'masked'
}

export function rowKeyOfTask(id: string): `t:${string}` {
  return `t:${id}`
}
export function rowKeyOfAssignment(id: string): `a:${string}` {
  return `a:${id}`
}
export function rowKeyOfProject(id: string): `p:${string}` {
  return `p:${id}`
}
export function rowKeyOfMasked(userId: string): `m:${string}` {
  return `m:${userId}`
}

/**
 * M9 person context (M9-D12, M9-D28). The server sends, per visible project, its `project` row followed by the person's
 * task rows (each followed by that person's assignee row), and the `masked` row. Each task row is **merged** with its
 * assignee row (key `a:<taskAssignmentId>`, depth 1) regardless of `assigneeCount` — every row belongs to this person;
 * a collapsed project (`p:<id>` in `collapsed`) hides its rows; completed tasks follow `showCompleted` (M6-D12); the
 * masked row is always last. The project context keeps buildViewRows.
 */
export function buildPersonViewRows(
  m: GridModel,
  o: { showCompleted: boolean; collapsed: ReadonlySet<string> },
): PersonViewRow[] {
  const assigneeOf = new Map<string, GridAssigneeRow>()
  for (const r of m.rows) if (r.kind === 'assignee' && !assigneeOf.has(r.taskId)) assigneeOf.set(r.taskId, r)
  const out: PersonViewRow[] = []
  let masked: MaskedViewRow | null = null
  let hidden = false
  for (const r of m.rows) {
    if (r.kind === 'project') {
      const key = rowKeyOfProject(r.id)
      const collapsed = o.collapsed.has(key)
      hidden = collapsed
      out.push({ key, kind: 'project', project: r, depth: 0, collapsed })
    } else if (r.kind === 'masked') {
      masked = { key: rowKeyOfMasked(r.userId), kind: 'masked', masked: r, depth: 0 }
    } else if (r.kind === 'task') {
      if (hidden || (!o.showCompleted && r.completed)) continue
      const a = assigneeOf.get(r.id)
      if (!a) continue
      out.push({ key: rowKeyOfAssignment(a.taskAssignmentId), kind: 'merged', task: r, assignee: a, depth: 1 })
    }
  }
  if (masked) out.push(masked)
  return out
}

const projectRowsCache = new WeakMap<readonly GridRow[], Map<string, GridProjectRow>>()
/** The `project` row of a person-context model by project id (cached per rows array). */
export function projectRowOf(m: Pick<GridModel, 'rows'>, projectId: string): GridProjectRow | undefined {
  let map = projectRowsCache.get(m.rows)
  if (!map) {
    map = new Map()
    for (const r of m.rows) if (r.kind === 'project') map.set(r.id, r)
    projectRowsCache.set(m.rows, map)
  }
  return map.get(projectId)
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
    else if (r.kind === 'assignee') {
      // M9 project/masked rows (person context): S3
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
export function cellEditability(row: CellRow, cell: AssigneeCell | undefined, m: GridModel): Editability
export function cellEditability(row: AnyViewRow, cell: AssigneeCell | undefined, m: GridModel): SumEditability
export function cellEditability(row: AnyViewRow, cell: AssigneeCell | undefined, m: GridModel): SumEditability {
  // M9: project / masked rows of the person grid are always read-only (their cells are sums)
  if (row.kind === 'project' || row.kind === 'masked') return 'readOnlyRow'
  if (m.context.kind === 'project' && m.context.archived) return 'archived'
  if (!m.context.canEdit) return 'noEdit'
  // M9: a merged row of a project the viewer may not plan in (its project row's canEdit)
  if (m.context.kind === 'person' && row.task.projectId !== undefined) {
    const p = projectRowOf(m, row.task.projectId)
    if (p && !p.canEdit) return 'noEdit'
  }
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
export function cellRowOf(row: GridViewRow): ViewRow
export function cellRowOf(row: AnyViewRow): CellRow
export function cellRowOf(row: AnyViewRow): CellRow {
  if (row.kind !== 'sum') return row
  const target = sumWriteTarget(row)
  if (target)
    return { key: rowKeyOfAssignment(target.taskAssignmentId), kind: 'merged', task: row.task, assignee: target, depth: row.depth }
  return { key: row.key, kind: 'task', task: row.task, depth: row.depth, collapsed: row.collapsed }
}

/** "👥 N" next to a summed task's name (FR-816): only for leaves with ≥ 2 assignees; null otherwise. */
export function sumPeopleCount(row: AnyViewRow): number | null {
  return row.kind === 'sum' && !row.task.hasChildren && row.assignees.length >= 2 ? row.assignees.length : null
}
