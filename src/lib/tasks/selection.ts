// src/lib/tasks/selection.ts — multi-select helpers (FR-614, M3-D23). Pure; inputs are never mutated.
import type { TaskRowModel } from './tree'

/** Cmd/Ctrl+click: add or remove one id. */
export function toggleSelect(sel: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(sel)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** Shift+click: every id between the anchor and the target (inclusive) in display order; only the target when the anchor is gone. */
export function rangeSelect(order: readonly string[], anchorId: string, targetId: string): Set<string> {
  const to = order.indexOf(targetId)
  if (to < 0) return new Set()
  const from = order.indexOf(anchorId)
  if (from < 0) return new Set([targetId])
  return new Set(order.slice(Math.min(from, to), Math.max(from, to) + 1))
}

/** Selected ids without those whose ancestor is also selected (the subtree goes with it), in DFS order. */
export function topLevelSelected(rows: readonly TaskRowModel[], sel: ReadonlySet<string>): string[] {
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]))
  const hasSelectedAncestor = (id: string): boolean => {
    for (let p = parentOf.get(id) ?? null; p !== null; p = parentOf.get(p) ?? null)
      if (sel.has(p)) return true
    return false
  }
  return rows.filter((r) => sel.has(r.id) && !hasSelectedAncestor(r.id)).map((r) => r.id)
}
