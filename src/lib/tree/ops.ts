// src/lib/tree/ops.ts — pure outliner operations (FR-603/604, AC-602, X62, M3-D11). The client computes **intent**
// (`parentId`, `afterId`); the server re-validates and owns the order keys. Inputs are full DFS-ordered lists
// (collapsed rows included). Order keys are compared in byte order with < / > only (X48, r4 §24).
import { subtreeHeight, type FlatItem } from './projection'

/** Tasks: depth 0..2 (BR-30). */
export const TASK_MAX_DEPTH_INDEX = 2

/** `afterId` null = first child of `parentId` (null = root level). */
export type Placement = { parentId: string | null; afterId: string | null }

export function compareKeys(a: string, b: string): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

/** DFS order with depths; siblings by (position, id) in byte order. Orphans (parent missing) and their subtrees are dropped. */
export function flattenTree<T extends { id: string; parentId: string | null; position: string }>(
  nodes: readonly T[],
): (T & { depth: number })[] {
  const byParent = new Map<string | null, T[]>()
  for (const n of nodes) {
    const list = byParent.get(n.parentId)
    if (list) list.push(n)
    else byParent.set(n.parentId, [n])
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => compareKeys(a.position, b.position) || compareKeys(a.id, b.id))
  }
  const out: (T & { depth: number })[] = []
  const visit = (parentId: string | null, depth: number) => {
    for (const n of byParent.get(parentId) ?? []) {
      out.push({ ...n, depth })
      visit(n.id, depth + 1)
    }
  }
  visit(null, 0)
  return out
}

/** Direct children of `parentId` (null = roots), in list order. */
export function childrenOf(items: readonly FlatItem[], parentId: string | null): FlatItem[] {
  return items.filter((i) => i.parentId === parentId)
}

/** Index range [start, end) of the row and its descendants (contiguous in DFS order); null when unknown. */
function blockOf(
  items: readonly FlatItem[],
  id: string,
): { start: number; end: number; root: FlatItem } | null {
  const start = items.findIndex((i) => i.id === id)
  const root = items[start]
  if (!root) return null
  let end = start + 1
  while (end < items.length && (items[end] as FlatItem).depth > root.depth) end++
  return { start, end, root }
}

/** Ids of every descendant of `id`, in DFS order. */
export function descendantIds(items: readonly FlatItem[], id: string): string[] {
  const b = blockOf(items, id)
  return b ? items.slice(b.start + 1, b.end).map((i) => i.id) : []
}

/** BR-30: a subtree of height `height` fits at `newDepth`. */
export function fitsDepth(newDepth: number, height: number, maxDepthIndex: number): boolean {
  return newDepth + height <= maxDepthIndex
}

function siblingsAround(items: readonly FlatItem[], id: string) {
  const item = items.find((i) => i.id === id)
  if (!item) return null
  const siblings = childrenOf(items, item.parentId)
  const k = siblings.findIndex((s) => s.id === id)
  return {
    item,
    prev: siblings[k - 1] ?? null,
    prev2: siblings[k - 2] ?? null,
    next: siblings[k + 1] ?? null,
  }
}

/** Tab: the previous sibling becomes the parent, appended after its last child; null when no previous sibling or too deep. */
export function indentTarget(
  items: readonly FlatItem[],
  id: string,
  maxDepthIndex: number,
): Placement | null {
  const s = siblingsAround(items, id)
  if (!s?.prev) return null
  if (!fitsDepth(s.prev.depth + 1, subtreeHeight(items, id), maxDepthIndex)) return null
  const kids = childrenOf(items, s.prev.id)
  return { parentId: s.prev.id, afterId: kids[kids.length - 1]?.id ?? null }
}

/** Shift+Tab: into the grandparent, right after the old parent; null at the root. */
export function outdentTarget(items: readonly FlatItem[], id: string): Placement | null {
  const item = items.find((i) => i.id === id)
  if (!item || item.parentId === null) return null
  const parent = items.find((i) => i.id === item.parentId)
  if (!parent) return null
  return { parentId: parent.parentId, afterId: parent.id }
}

/** Swap with the previous sibling; null for a first child. */
export function moveUpTarget(items: readonly FlatItem[], id: string): Placement | null {
  const s = siblingsAround(items, id)
  if (!s?.prev) return null
  return { parentId: s.item.parentId, afterId: s.prev2?.id ?? null }
}

/** Place after the next sibling; null for a last child. */
export function moveDownTarget(items: readonly FlatItem[], id: string): Placement | null {
  const s = siblingsAround(items, id)
  if (!s?.next) return null
  return { parentId: s.item.parentId, afterId: s.next.id }
}

/** Where the row is now (for undo). RangeError for an unknown id. */
export function currentPlacement(items: readonly FlatItem[], id: string): Placement {
  const s = siblingsAround(items, id)
  if (!s) throw new RangeError(`unknown tree item ${id}`)
  return { parentId: s.item.parentId, afterId: s.prev?.id ?? null }
}

/**
 * Optimistic move: re-parent the subtree of `id` to `to`, give the root `provisionalPosition`, recompute depths and
 * return the new DFS list. RangeError when the id, the parent or `afterId` is not valid for this list.
 */
export function applyPlacement(
  items: readonly FlatItem[],
  id: string,
  to: Placement,
  provisionalPosition: string,
): FlatItem[] {
  const b = blockOf(items, id)
  if (!b) throw new RangeError(`unknown tree item ${id}`)
  const rest = [...items.slice(0, b.start), ...items.slice(b.end)]
  let parentDepth = -1
  let insertAt = 0
  if (to.parentId !== null) {
    const pi = rest.findIndex((i) => i.id === to.parentId)
    if (pi < 0) throw new RangeError(`parent ${to.parentId} is unknown or inside the moved subtree`)
    parentDepth = (rest[pi] as FlatItem).depth
    insertAt = pi + 1
  }
  if (to.afterId !== null) {
    const after = blockOf(rest, to.afterId)
    if (!after || after.root.parentId !== to.parentId) {
      throw new RangeError(`${to.afterId} is not a child of ${String(to.parentId)}`)
    }
    insertAt = after.end
  }
  const delta = parentDepth + 1 - b.root.depth
  const moved = items
    .slice(b.start, b.end)
    .map((i, k) =>
      k === 0
        ? { ...i, parentId: to.parentId, position: provisionalPosition, depth: i.depth + delta }
        : { ...i, depth: i.depth + delta },
    )
  return [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)]
}
