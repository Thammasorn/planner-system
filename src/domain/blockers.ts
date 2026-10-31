// src/domain/blockers.ts — "ถูกขวางโดย" links (SPEC v3.1 BR-85/86, FR-642/644, X73). Pure.
// Edges are same-project only (D12); the service checks the project and serialises cycle checks (M3-D32).

/** `blockerId` blocks `blockedId`. */
export interface BlockerEdge {
  blockerId: string
  blockedId: string
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The cycle the new edge blockerId → blockedId would close, in "blocks" order, e.g. ['B','A','B']; null when none.
 * Self edge → [id, id]. BFS from blockedId along existing edges, neighbours visited in id order, so the returned
 * path is a deterministic shortest one.
 */
export function wouldCreateCycle(
  edges: readonly BlockerEdge[],
  blockerId: string,
  blockedId: string,
): string[] | null {
  if (blockerId === blockedId) return [blockerId, blockerId]
  const next = new Map<string, string[]>()
  for (const e of edges) {
    const list = next.get(e.blockerId)
    if (list) list.push(e.blockedId)
    else next.set(e.blockerId, [e.blockedId])
  }
  for (const list of next.values()) list.sort(cmp)

  const cameFrom = new Map<string, string>() // node → the node BFS reached it from
  const queue: string[] = [blockedId]
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head] as string
    for (const n of next.get(node) ?? []) {
      if (n === blockedId || cameFrom.has(n)) continue
      if (n === blockerId) {
        // walk back node → … → blockedId, then read it forwards: blockerId → blockedId → … → node → blockerId
        const back: string[] = []
        for (let at = node; at !== blockedId; at = cameFrom.get(at) as string) back.push(at)
        return [blockerId, blockedId, ...back.reverse(), blockerId]
      }
      cameFrom.set(n, node)
      queue.push(n)
    }
  }
  return null
}

export type BlockerProblem =
  { reason: 'SELF' } | { reason: 'ANCESTRY' } | { reason: 'DUPLICATE' } | { reason: 'CYCLE'; path: string[] }

/** Ancestors are at most 2 hops away (BR-30: depth 0..2). */
const MAX_ANCESTOR_HOPS = 2

function isAncestor(parentOf: (id: string) => string | null, ancestorId: string, id: string): boolean {
  let at = parentOf(id)
  for (let hop = 1; hop <= MAX_ANCESTOR_HOPS && at !== null; hop++) {
    if (at === ancestorId) return true
    at = parentOf(at)
  }
  return false
}

/** BR-85 checks in order SELF, ANCESTRY, DUPLICATE, CYCLE (the same-project check is the service's). */
export function checkBlocker(a: {
  edges: readonly BlockerEdge[]
  parentOf: (id: string) => string | null
  blockerId: string
  blockedId: string
}): BlockerProblem | null {
  const { edges, parentOf, blockerId, blockedId } = a
  if (blockerId === blockedId) return { reason: 'SELF' }
  if (isAncestor(parentOf, blockerId, blockedId) || isAncestor(parentOf, blockedId, blockerId)) {
    return { reason: 'ANCESTRY' }
  }
  if (edges.some((e) => e.blockerId === blockerId && e.blockedId === blockedId))
    return { reason: 'DUPLICATE' }
  const path = wouldCreateCycle(edges, blockerId, blockedId)
  return path === null ? null : { reason: 'CYCLE', path }
}

export type BlockerBadge = { kind: 'WAITING'; open: number } | { kind: 'CLEARED' } | null

/** BR-86: open > 0 → ⛔ "รอ N งาน"; open = 0 and total > 0 → ✓ "ตัวขวางเสร็จแล้ว"; total = 0 → nothing. */
export function blockerBadge(c: { open: number; total: number }): BlockerBadge {
  if (c.open > 0) return { kind: 'WAITING', open: c.open }
  if (c.total > 0) return { kind: 'CLEARED' }
  return null
}
