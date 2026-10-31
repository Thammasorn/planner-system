// src/lib/pages/tree.ts — pure helpers for the lazily loaded page trees (FR-503, M4-D23, X05). Isomorphic, no React.
import type { PageTreeNode } from '@/lib/contracts/pages'
import { subtreeHeight, type FlatItem } from '@/lib/tree/projection'

/** One visible row of a page tree (SortableTree item). `depth` is the DFS depth inside the rendered tree. */
export interface TreeRow extends FlatItem {
  node: PageTreeNode
}

/** `sidebar.expanded` holds at most this many values (preference schema cap). */
export const EXPANDED_MAX = 500

const PAGE_PREFIX = 'page:'

/** The `sidebar.expanded` value of an expanded page row. */
export const pageExpandKey = (pageId: string): string => `${PAGE_PREFIX}${pageId}`

/** Page ids that are expanded according to the stored `sidebar.expanded` values. */
export function expandedPageIds(prefValues: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const v of prefValues) if (v.startsWith(PAGE_PREFIX)) out.add(v.slice(PAGE_PREFIX.length))
  return out
}

/**
 * DFS over the loaded levels: a node's children appear only when it is expanded **and** its children are loaded.
 * Each level keeps the server order (`ORDER BY position, id`).
 */
export function flattenPageTree(
  roots: readonly PageTreeNode[],
  children: ReadonlyMap<string, readonly PageTreeNode[]>,
  expanded: ReadonlySet<string>,
): TreeRow[] {
  const out: TreeRow[] = []
  const visit = (nodes: readonly PageTreeNode[], parentId: string | null, depth: number) => {
    for (const n of nodes) {
      out.push({ id: n.id, parentId, depth, position: n.position, node: n })
      if (!expanded.has(n.id)) continue
      const kids = children.get(n.id)
      if (kids) visit(kids, n.id, depth + 1)
    }
  }
  visit(roots, null, 0)
  return out
}

/**
 * New `sidebar.expanded` value after opening/closing one page row. Every other value (`project:` keys and other
 * pages) is kept in order; when the cap is exceeded the oldest `page:` values are dropped first.
 */
export function toggleExpanded(prefValues: readonly string[], pageId: string, open: boolean): string[] {
  const key = pageExpandKey(pageId)
  const next = prefValues.filter((v) => v !== key)
  if (open) next.push(key)
  let excess = next.length - EXPANDED_MAX
  if (excess <= 0) return next
  return next.filter((v) => {
    if (excess > 0 && v.startsWith(PAGE_PREFIX) && v !== key) {
      excess--
      return false
    }
    return true
  })
}

/** Keyboard alternatives to dragging a row (FR-503, the row ⋯ menu); null = not possible from here. */
export interface KeyboardMoves {
  /** Before the previous sibling. */
  up: { parentId: string | null; afterId: string | null } | null
  /** After the next sibling. */
  down: { parentId: string | null; afterId: string } | null
  /** Last child of the previous sibling; the caller resolves `afterId` (that level may not be loaded yet). */
  indent: { parentId: string } | null
  /** Right after the parent, one level up. */
  outdent: { parentId: string | null; afterId: string } | null
}

/**
 * Where row `id` can move by one step among the visible rows (DFS order, `depth` = page depth). Siblings of a visible
 * row are complete (a level loads as a whole); the depth check counts the loaded subtree only — the server stays the
 * authority on depth, protection and the charter (M4-D23).
 */
export function keyboardMoves(rows: readonly FlatItem[], id: string, maxDepthIndex: number): KeyboardMoves {
  const none: KeyboardMoves = { up: null, down: null, indent: null, outdent: null }
  const row = rows.find((r) => r.id === id)
  if (!row) return none
  const siblings = rows.filter((r) => r.parentId === row.parentId)
  const i = siblings.findIndex((r) => r.id === id)
  const prev = siblings[i - 1]
  const next = siblings[i + 1]
  const parent = row.parentId === null ? undefined : rows.find((r) => r.id === row.parentId)
  return {
    up: prev ? { parentId: row.parentId, afterId: siblings[i - 2]?.id ?? null } : null,
    down: next ? { parentId: row.parentId, afterId: next.id } : null,
    indent: prev && row.depth + 1 + subtreeHeight(rows, id) <= maxDepthIndex ? { parentId: prev.id } : null,
    outdent: parent ? { parentId: parent.parentId, afterId: parent.id } : null,
  }
}
