// Pure helpers for a sortable tree (tasks: 3 levels, pages: 10 levels).
// Adapted from dnd-kit's official SortableTree example (stories/3 - Examples/Tree/utilities.ts) with:
//  - a depth cap that accounts for the height of the dragged subtree
//  - an explicit "invalid" result when no depth satisfies both the cap and the neighbour constraints
//  - sibling lookup that skips deeper rows (needed to compute the fractional-index position)
export type FlatItem = { id: string; parentId: string | null; depth: number; position: string }
export type Projection =
  | { valid: true; depth: number; parentId: string | null; prevSiblingId: string | null; nextSiblingId: string | null }
  | { valid: false }

function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const copy = [...arr]
  const [item] = copy.splice(from, 1)
  if (item !== undefined) copy.splice(to, 0, item)
  return copy
}

/** Height of the subtree rooted at index `start` (0 = leaf). `items` must be in DFS order. */
export function subtreeHeight(items: readonly FlatItem[], id: string): number {
  const start = items.findIndex((i) => i.id === id)
  const root = items[start]
  if (!root) return 0
  let h = 0
  for (let k = start + 1; k < items.length; k++) {
    const it = items[k]
    if (!it || it.depth <= root.depth) break
    h = Math.max(h, it.depth - root.depth)
  }
  return h
}

/** Remove descendants of `ids` (the dragged item's children travel with it and are hidden while dragging). */
export function removeChildrenOf(items: readonly FlatItem[], ids: readonly string[]): FlatItem[] {
  const excluded = new Set(ids)
  return items.filter((i) => {
    if (i.parentId !== null && excluded.has(i.parentId)) {
      excluded.add(i.id)
      return false
    }
    return true
  })
}

/**
 * @param visible        flattened rows WITHOUT the active item's descendants (see removeChildrenOf)
 * @param activeHeight   subtreeHeight(fullItems, activeId) computed on the FULL list
 * @param maxDepthIndex  deepest allowed depth: tasks 2 (3 levels), pages 9 (10 levels)
 */
export function getProjection(
  visible: readonly FlatItem[],
  activeId: string,
  overId: string,
  dragOffsetX: number,
  indent: number,
  maxDepthIndex: number,
  activeHeight: number,
): Projection {
  const activeIndex = visible.findIndex((i) => i.id === activeId)
  const overIndex = visible.findIndex((i) => i.id === overId)
  const active = visible[activeIndex]
  if (!active || overIndex < 0) return { valid: false }
  const moved = arrayMove(visible, activeIndex, overIndex)
  const prev = moved[overIndex - 1]
  const next = moved[overIndex + 1]
  const projected = active.depth + Math.round(dragOffsetX / indent)
  const maxDepth = Math.min(prev ? prev.depth + 1 : 0, maxDepthIndex - activeHeight)
  const minDepth = next ? next.depth : 0 // shallower than `next` would adopt it as a child
  if (maxDepth < minDepth) return { valid: false }
  const depth = Math.min(Math.max(projected, minDepth), maxDepth)

  let parentId: string | null = null
  let prevSiblingId: string | null = null
  for (let k = overIndex - 1; k >= 0; k--) {
    const it = moved[k]
    if (!it) break
    if (it.depth === depth) {
      prevSiblingId = it.id
      parentId = it.parentId
      break
    }
    if (it.depth < depth) {
      parentId = it.id // first shallower row above is the parent
      break
    }
  }
  let nextSiblingId: string | null = null
  for (let k = overIndex + 1; k < moved.length; k++) {
    const it = moved[k]
    if (!it || it.depth < depth) break
    if (it.depth === depth) {
      nextSiblingId = it.id
      break
    }
  }
  return { valid: true, depth, parentId, prevSiblingId, nextSiblingId }
}
