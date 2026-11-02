// src/lib/grid/row-drop.ts — reordering task rows in the plan grid (SPEC FR-815, BR-105, M7.1-D16/D18). Pure.
// The drop target is arithmetic on the visible rows (the grid is virtualized) and reuses M3's tree projection, so a
// grid drop means exactly what the same drop means in the task list; the server (moveTask) stays the authority.
import type { PeriodKey } from '@/domain/types'
import type { GridResponse, GridRow, GridTaskRow } from '@/lib/contracts/grid'
import { TASK_MAX_DEPTH_INDEX, type Placement } from '@/lib/tree/ops'
import { getProjection, removeChildrenOf, subtreeHeight, type FlatItem } from '@/lib/tree/projection'
import type { GridViewRow } from './rows'
import { recomputeTotals } from './totals'

export interface TaskBlock {
  taskId: string
  /** view-row index of the task's own first / last row (its assignee rows included, descendants excluded) */
  firstIndex: number
  lastIndex: number
  depth: number
}

/** Consecutive view rows of one task (assignee rows belong to the task above them). */
export function taskBlocks(viewRows: readonly GridViewRow[]): TaskBlock[] {
  const out: TaskBlock[] = []
  viewRows.forEach((r, i) => {
    const last = out[out.length - 1]
    if (last && last.taskId === r.task.id) last.lastIndex = i
    else out.push({ taskId: r.task.id, firstIndex: i, lastIndex: i, depth: r.task.depth })
  })
  return out
}

export interface DropTarget {
  /** what to send to moveTask; null = no move (invalid, or the task would land where it is) */
  placement: Placement | null
  /** projected depth of the dragged row (indicator indent) */
  depth: number
  /** view-row index the indicator line is drawn above (viewRows.length = below the last row); -1 = none */
  indicatorIndex: number
  /** false when no depth satisfies BR-30 and the neighbours (show th.grid.reorder.invalid) */
  valid: boolean
}

/**
 * M7.1-D16. `pointerIndex` = the view row under the pointer (clamped to the rows); `dx` = horizontal drag offset.
 * Over a task's own row → M3 semantics (dragging down lands after it, up before it); over one of its assignee rows →
 * after that task's block. Over the active task's own subtree → no move. Hidden tasks (collapsed / completed) are not
 * in `viewRows` and keep their place relative to each other (BR-105).
 */
export function dropTarget(o: {
  viewRows: readonly GridViewRow[]
  /** the project's full task tree in DFS order (useProjectTasks → flattenTree) */
  items: readonly FlatItem[]
  activeTaskId: string
  pointerIndex: number
  dx: number
  indentPx: number
}): DropTarget {
  const byId = new Map(o.items.map((i) => [i.id, i]))
  const blocks = taskBlocks(o.viewRows).filter((b) => byId.has(b.taskId))
  const activeBlock = blocks.find((b) => b.taskId === o.activeTaskId)
  const none: DropTarget = { placement: null, depth: 0, indicatorIndex: -1, valid: false }
  if (!activeBlock || blocks.length === 0) return none

  const visible = removeChildrenOf(
    blocks.map((b) => byId.get(b.taskId)!),
    [o.activeTaskId],
  )
  const inVisible = new Set(visible.map((i) => i.id))
  const p = Math.max(0, Math.min(o.viewRows.length - 1, o.pointerIndex))
  const over = blocks.find((b) => b.firstIndex <= p && p <= b.lastIndex)!
  const activeIdx = visible.findIndex((i) => i.id === o.activeTaskId)
  let overId = o.activeTaskId
  if (inVisible.has(over.taskId) && over.taskId !== o.activeTaskId) {
    const overIdx = visible.findIndex((i) => i.id === over.taskId)
    overId =
      p > over.firstIndex && activeIdx > overIdx
        ? visible[overIdx + 1]!.id // up over an assignee row → before the next block = after this one
        : over.taskId
  }

  const active = visible[activeIdx]!
  const proj = getProjection(
    visible,
    o.activeTaskId,
    overId,
    o.dx,
    o.indentPx,
    TASK_MAX_DEPTH_INDEX,
    subtreeHeight(o.items, o.activeTaskId),
  )
  // indicator: below the own rows of the item that will sit right above the dragged one
  const overIdx = visible.findIndex((i) => i.id === overId)
  const moved = [...visible]
  moved.splice(activeIdx, 1)
  moved.splice(overIdx, 0, active)
  const prev = moved[overIdx - 1]
  const prevBlock = prev ? blocks.find((b) => b.taskId === prev.id) : undefined
  const indicatorIndex = prevBlock ? prevBlock.lastIndex + 1 : 0

  if (!proj.valid) return { placement: null, depth: active.depth, indicatorIndex, valid: false }
  const placement: Placement = { parentId: proj.parentId, afterId: proj.prevSiblingId }
  // no-op: same parent and the same visible previous sibling as now
  let visiblePrev: string | null = null
  for (let k = activeIdx - 1; k >= 0; k--) {
    const it = visible[k]!
    if (it.depth < active.depth) break
    if (it.depth === active.depth && it.parentId === active.parentId) {
      visiblePrev = it.id
      break
    }
  }
  const same = placement.parentId === active.parentId && placement.afterId === visiblePrev
  return { placement: same ? null : placement, depth: proj.depth, indicatorIndex, valid: true }
}

export interface RowMove extends Placement {
  taskId: string
}

/** [start, end) of a task row, its descendants and all their assignee rows (contiguous in the DFS response). */
function blockRange(rows: readonly GridRow[], taskId: string): { start: number; end: number } | null {
  const start = rows.findIndex((r) => r.kind === 'task' && r.id === taskId)
  if (start < 0) return null
  const depth = (rows[start] as GridTaskRow).depth
  let end = start + 1
  while (end < rows.length) {
    const r = rows[end]!
    if (r.kind === 'task' && r.depth <= depth) break
    end++
  }
  return { start, end }
}

/**
 * M7.1-D18 optimistic order: the task's block (task row + descendants + their assignee rows) moved to `parentId` /
 * after `afterId` (null = first child), root `parentId` and the subtree's depths rewritten, `hasChildren` and the
 * totals of the old and new parent chains recomputed. A move the response cannot represent (unknown ids, into its
 * own subtree, afterId not a child of parentId, deeper than BR-30) returns `resp` unchanged.
 */
export function applyRowMove(resp: GridResponse, move: RowMove): GridResponse {
  const b = blockRange(resp.rows, move.taskId)
  if (!b) return resp
  const root = resp.rows[b.start] as GridTaskRow
  const block = resp.rows.slice(b.start, b.end)
  const rest = [...resp.rows.slice(0, b.start), ...resp.rows.slice(b.end)]

  let insertAt = 0
  let parentDepth = -1
  if (move.parentId !== null) {
    const pi = rest.findIndex((r) => r.kind === 'task' && r.id === move.parentId)
    if (pi < 0) return resp
    parentDepth = (rest[pi] as GridTaskRow).depth
    insertAt = pi + 1
    while (insertAt < rest.length && rest[insertAt]!.kind === 'assignee') insertAt++
  }
  if (move.afterId !== null) {
    const after = blockRange(rest, move.afterId)
    if (!after || (rest[after.start] as GridTaskRow).parentId !== move.parentId) return resp
    insertAt = after.end
  }
  let height = 0
  for (const r of block) if (r.kind === 'task') height = Math.max(height, r.depth - root.depth)
  const delta = parentDepth + 1 - root.depth
  if (root.depth + delta + height > TASK_MAX_DEPTH_INDEX) return resp

  const movedRows = block.map((r): GridRow => {
    if (r.kind !== 'task') return r
    const depth = (r.depth + delta) as GridTaskRow['depth']
    return r.id === root.id ? { ...r, parentId: move.parentId, depth } : { ...r, depth }
  })
  const rows = [...rest.slice(0, insertAt), ...movedRows, ...rest.slice(insertAt)]
  const parents = new Set<string>()
  if (root.parentId !== null) parents.add(root.parentId)
  if (move.parentId !== null) parents.add(move.parentId)
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    if (r.kind !== 'task' || !parents.has(r.id)) continue
    const hasChildren = rows.some((c) => c.kind === 'task' && c.parentId === r.id)
    if (hasChildren !== r.hasChildren) rows[i] = { ...r, hasChildren }
  }
  recomputeTotals(rows, parents, new Set<PeriodKey>(resp.periods.map((p) => p.key)))
  return { ...resp, rows }
}

/** Indent per depth level in the grid's task cell (--space-4) = the horizontal drag step (M7.1-D16). */
export const INDENT_PX = 16
/** Autoscroll zone at the body's top / bottom edge and the step per animation frame (M7.1-D16). */
export const AUTOSCROLL_ZONE_PX = 40
export const AUTOSCROLL_MAX_PX = 12
/** Touch: long-press on ⠿ before a drag starts (FR-815). */
export const LONG_PRESS_MS = 300

/** View-row index under a pointer: arithmetic on the uniform row height (never DOM measurement, R3). */
export function pointerRowIndex(o: {
  clientY: number
  scrollerTop: number
  scrollTop: number
  headerH: number
  rowH: number
}): number {
  return Math.floor((o.clientY - o.scrollerTop + o.scrollTop - o.headerH) / o.rowH)
}

/**
 * Autoscroll speed (px per frame, signed) for a pointer at `y` inside a body spanning [top, bottom] (client px):
 * 0 outside the edge zones, growing linearly to ±AUTOSCROLL_MAX_PX at (and beyond) the edge.
 */
export function autoscrollStep(y: number, top: number, bottom: number): number {
  if (bottom - top <= 2 * AUTOSCROLL_ZONE_PX) return 0
  const ramp = (d: number) => Math.ceil((Math.min(AUTOSCROLL_ZONE_PX, AUTOSCROLL_ZONE_PX - d) / AUTOSCROLL_ZONE_PX) * AUTOSCROLL_MAX_PX)
  if (y < top + AUTOSCROLL_ZONE_PX) return -ramp(Math.max(0, y - top))
  if (y > bottom - AUTOSCROLL_ZONE_PX) return ramp(Math.max(0, bottom - y))
  return 0
}
