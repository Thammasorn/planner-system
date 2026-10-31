// src/lib/tasks/tree.ts — task rows for the outliner (FR-603/607/608, M3-D6). Pure; built from the flat task list
// of GET /api/projects/[id]/tasks (X62).
import type { TaskDepth, TaskDTO } from '@/lib/contracts/tasks'
import { flattenTree } from '@/lib/tree/ops'

export interface TaskRowModel extends TaskDTO {
  depth: TaskDepth
  hasChildren: boolean
  isLeaf: boolean
  /** Ancestor names, root first (breadcrumb in grouped views and board cards). */
  parentPath: string[]
}

/** DFS order (siblings by position, id — byte order) with tree flags. */
export function buildTaskRows(tasks: readonly TaskDTO[]): TaskRowModel[] {
  const flat = flattenTree(tasks)
  const withChildren = new Set(flat.map((t) => t.parentId))
  const nameById = new Map(flat.map((t) => [t.id, t.name]))
  // DFS: a parent's path is always computed before its children's
  const pathById = new Map<string | null, string[]>([[null, []]])
  return flat.map((t) => {
    const above = pathById.get(t.parentId) as string[]
    const parentPath = t.parentId === null ? [] : [...above, nameById.get(t.parentId) as string]
    pathById.set(t.id, parentPath)
    const hasChildren = withChildren.has(t.id)
    return { ...t, depth: t.depth, hasChildren, isLeaf: !hasChildren, parentPath }
  })
}

/** The row's index and the end (exclusive) of its subtree block; null when unknown. */
function block(rows: readonly TaskRowModel[], id: string): { start: number; end: number } | null {
  const start = rows.findIndex((r) => r.id === id)
  const root = rows[start]
  if (!root) return null
  let end = start + 1
  while (end < rows.length && (rows[end] as TaskRowModel).depth > root.depth) end++
  return { start, end }
}

function subtree(rows: readonly TaskRowModel[], id: string): TaskRowModel[] {
  const b = block(rows, id)
  return b ? rows.slice(b.start, b.end) : []
}

/** The row and every descendant are completed (false for an unknown id). */
export function isSubtreeComplete(rows: readonly TaskRowModel[], id: string): boolean {
  const s = subtree(rows, id)
  return s.length > 0 && s.every((r) => r.completedOn !== null)
}

/**
 * Rows to render: descendants of collapsed rows are hidden; with `showCompleted` off a completed row is hidden only
 * when its whole subtree is completed (M3-D6 — an open child keeps its completed parent visible).
 */
export function visibleRows(
  rows: readonly TaskRowModel[],
  o: { collapsed: ReadonlySet<string>; showCompleted: boolean },
): TaskRowModel[] {
  const out: TaskRowModel[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as TaskRowModel
    const hideSubtree = !o.showCompleted && r.completedOn !== null && isSubtreeComplete(rows, r.id)
    if (!hideSubtree) out.push(r)
    if (hideSubtree || o.collapsed.has(r.id)) i = (block(rows, r.id) as { end: number }).end - 1
  }
  return out
}

/** Open descendants of `id` in DFS order (FR-608 "ติ๊กงานย่อยทั้งหมดด้วยไหม"). */
export function openDescendants(rows: readonly TaskRowModel[], id: string): string[] {
  return subtree(rows, id)
    .slice(1)
    .filter((r) => r.completedOn === null)
    .map((r) => r.id)
}

/** Distinct assignee user ids of the row and its subtree, first-seen DFS order (read-only parent chips, BR-31). */
export function unionAssigneeIds(rows: readonly TaskRowModel[], id: string): string[] {
  return [...new Set(subtree(rows, id).flatMap((r) => r.assignees.map((a) => a.userId)))]
}
