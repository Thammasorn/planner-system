// src/lib/grid/row-drop.ts — reordering task rows in the plan grid (SPEC FR-815, BR-105, M7.1-D16/D18, v3.9). Pure.
// The drop target is arithmetic on the visible rows (the grid is virtualized) with the same depth rules as M3's tree
// projection (neighbour limits + BR-30 with the subtree's height); the server (moveTask) stays the authority.
import type { PeriodKey } from '@/domain/types'
import type { GridResponse, GridRow, GridTaskRow } from '@/lib/contracts/grid'
import { TASK_MAX_DEPTH_INDEX, type Placement } from '@/lib/tree/ops'
import { removeChildrenOf, subtreeHeight, type FlatItem } from '@/lib/tree/projection'
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
  /** view-row index the indicator line (and the opened gap) sits above (viewRows.length = below the last row);
   *  -1 = none (unknown task, or the drop would leave the task where it is) */
  indicatorIndex: number
  /** false when no depth satisfies BR-30 and the neighbours (show th.grid.reorder.invalid, no drop) */
  valid: boolean
  /** the would-be parent (null = top level) — highlighted while dragging; undefined when invalid */
  parentId?: string | null
}

/**
 * v3.9 (FR-815, owner feedback — Notion/Linear-like). `rowPos` = the pointer's position in view rows (float, gap
 * already removed by logicalRowPos); `dx` = horizontal drag offset. The pointer picks a slot between task blocks: the
 * upper half of a block (task row + its assignee rows) = before it, the lower half = after it — so the lower half of an
 * expanded parent lands before its first child, i.e. inside it. `dx` then picks the depth between the neighbours'
 * limits (right = child of the row above, left = out), capped by BR-30 with the dragged subtree's height. Over the
 * dragged task's own subtree = no move. Hidden tasks (collapsed / completed) keep their place (BR-105).
 */
export function dropAt(o: {
  viewRows: readonly GridViewRow[]
  /** the project's full task tree in DFS order (useProjectTasks → flattenTree) */
  items: readonly FlatItem[]
  activeTaskId: string
  rowPos: number
  dx: number
  indentPx: number
}): DropTarget {
  const byId = new Map(o.items.map((i) => [i.id, i]))
  const blocks = taskBlocks(o.viewRows).filter((b) => byId.has(b.taskId))
  const none: DropTarget = { placement: null, depth: 0, indicatorIndex: -1, valid: false }
  if (!blocks.some((b) => b.taskId === o.activeTaskId)) return none

  const visible = removeChildrenOf(
    blocks.map((b) => byId.get(b.taskId)!),
    [o.activeTaskId],
  )
  const activeIdx = visible.findIndex((i) => i.id === o.activeTaskId)
  const active = visible[activeIdx]!
  const rest = visible.filter((i) => i.id !== o.activeTaskId)
  const restIdx = new Map(rest.map((it, k) => [it.id, k]))

  const p = Math.max(0, Math.min(o.viewRows.length - 1, Math.floor(o.rowPos)))
  const over = blocks.find((b) => b.firstIndex <= p && p <= b.lastIndex)!
  const overRest = restIdx.get(over.taskId)
  // over the dragged task or one of its (hidden-while-dragging) descendants: stay
  if (overRest === undefined) return { placement: null, depth: active.depth, indicatorIndex: -1, valid: true }
  const lower = o.rowPos >= (over.firstIndex + over.lastIndex + 1) / 2
  const slot = overRest + (lower ? 1 : 0)

  const prev = rest[slot - 1]
  const next = rest[slot]
  const nextBlock = next ? blocks.find((b) => b.taskId === next.id) : undefined
  const indicatorIndex = nextBlock ? nextBlock.firstIndex : o.viewRows.length
  const height = subtreeHeight(o.items, o.activeTaskId)
  const maxDepth = Math.min(prev ? prev.depth + 1 : 0, TASK_MAX_DEPTH_INDEX - height)
  const minDepth = next ? next.depth : 0 // shallower than `next` would adopt it as a child
  if (maxDepth < minDepth) return { placement: null, depth: active.depth, indicatorIndex, valid: false }
  const projected = active.depth + Math.round(o.dx / o.indentPx)
  const depth = Math.min(Math.max(projected, minDepth), maxDepth)

  let parentId: string | null = null
  let afterId: string | null = null
  for (let k = slot - 1; k >= 0; k--) {
    const it = rest[k]!
    if (it.depth === depth) {
      afterId = it.id
      parentId = it.parentId
      break
    }
    if (it.depth < depth) {
      parentId = it.id // first shallower row above is the parent
      break
    }
  }
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
  if (parentId === active.parentId && afterId === visiblePrev)
    return { placement: null, depth, indicatorIndex: -1, valid: true, parentId }
  return { placement: { parentId, afterId }, depth, indicatorIndex, valid: true, parentId }
}

/**
 * v3.9: rows at and below the indicator are drawn one row lower while dragging (the opened gap). Maps the pointer's
 * visual position (in rows) back to the unshifted row geometry; null = the pointer is inside the gap (keep the target).
 */
export function logicalRowPos(visualRows: number, gapIndex: number): number | null {
  if (gapIndex < 0 || visualRows < gapIndex) return visualRows
  if (visualRows < gapIndex + 1) return null
  return visualRows - 1
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
/** v3.9: rows sliding out of the way / the ghost's return on Esc (none with prefers-reduced-motion). */
export const DRAG_ANIM_MS = 150
/** Autoscroll zone at the body's top / bottom edge and the step per animation frame (M7.1-D16). */
export const AUTOSCROLL_ZONE_PX = 40
export const AUTOSCROLL_MAX_PX = 12
/** Touch: long-press on ⠿ before a drag starts (FR-815). */
export const LONG_PRESS_MS = 300

/** Pointer position in view rows (float; floor = the row under it): arithmetic on the uniform row height (never DOM
 *  measurement, R3). */
export function pointerRowPos(o: {
  clientY: number
  scrollerTop: number
  scrollTop: number
  headerH: number
  rowH: number
}): number {
  return (o.clientY - o.scrollerTop + o.scrollTop - o.headerH) / o.rowH
}

/** View-row index under a pointer. */
export function pointerRowIndex(o: Parameters<typeof pointerRowPos>[0]): number {
  return Math.floor(pointerRowPos(o))
}

/**
 * Autoscroll speed (px per frame, signed) for a pointer at `y` inside a body spanning [top, bottom] (client px):
 * 0 outside the edge zones, growing linearly to ±AUTOSCROLL_MAX_PX at (and beyond) the edge.
 */
export function autoscrollStep(y: number, top: number, bottom: number): number {
  if (bottom - top <= 2 * AUTOSCROLL_ZONE_PX) return 0
  const ramp = (d: number) =>
    Math.ceil((Math.min(AUTOSCROLL_ZONE_PX, AUTOSCROLL_ZONE_PX - d) / AUTOSCROLL_ZONE_PX) * AUTOSCROLL_MAX_PX)
  if (y < top + AUTOSCROLL_ZONE_PX) return -ramp(Math.max(0, y - top))
  if (y > bottom - AUTOSCROLL_ZONE_PX) return ramp(Math.max(0, bottom - y))
  return 0
}
