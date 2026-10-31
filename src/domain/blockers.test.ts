import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { blockerBadge, checkBlocker, wouldCreateCycle, type BlockerEdge } from './blockers'

const e = (blockerId: string, blockedId: string): BlockerEdge => ({ blockerId, blockedId })

/** Kahn's algorithm: true when every node can be removed (no cycle). */
function isAcyclic(nodes: readonly string[], edges: readonly BlockerEdge[]): boolean {
  const indeg = new Map(nodes.map((n) => [n, 0]))
  for (const x of edges) indeg.set(x.blockedId, (indeg.get(x.blockedId) ?? 0) + 1)
  const queue = nodes.filter((n) => indeg.get(n) === 0)
  let removed = 0
  while (queue.length > 0) {
    const n = queue.shift()!
    removed++
    for (const x of edges) {
      if (x.blockerId !== n) continue
      const d = (indeg.get(x.blockedId) ?? 0) - 1
      indeg.set(x.blockedId, d)
      if (d === 0) queue.push(x.blockedId)
    }
  }
  return removed === nodes.length
}

describe('BR-85 wouldCreateCycle', () => {
  it('direct: A→B exists, adding B→A → [B, A, B]', () => {
    expect(wouldCreateCycle([e('A', 'B')], 'B', 'A')).toEqual(['B', 'A', 'B'])
  })

  it('indirect: A→B, B→C exist, adding C→A → [C, A, B, C]', () => {
    expect(wouldCreateCycle([e('A', 'B'), e('B', 'C')], 'C', 'A')).toEqual(['C', 'A', 'B', 'C'])
  })

  it('unrelated: A→B exists, adding D→A → null', () => {
    expect(wouldCreateCycle([e('A', 'B')], 'D', 'A')).toBeNull()
  })

  it('self: A→A → [A, A]', () => {
    expect(wouldCreateCycle([], 'A', 'A')).toEqual(['A', 'A'])
  })

  it('no edges → null', () => {
    expect(wouldCreateCycle([], 'A', 'B')).toBeNull()
  })

  it('returns the shortest path, neighbours visited in id order (deterministic)', () => {
    // two equal-length routes A→C→D and A→B→D (C listed first); B < C wins
    const edges = [e('A', 'C'), e('C', 'D'), e('A', 'B'), e('B', 'D')]
    expect(wouldCreateCycle(edges, 'D', 'A')).toEqual(['D', 'A', 'B', 'D'])
    // a direct edge beats a longer route
    expect(wouldCreateCycle([...edges, e('A', 'D')], 'D', 'A')).toEqual(['D', 'A', 'D'])
  })

  it('a diamond with a shared node does not loop forever and finds no false cycle', () => {
    const edges = [e('A', 'B'), e('A', 'C'), e('B', 'D'), e('C', 'D')]
    expect(wouldCreateCycle(edges, 'A', 'D')).toBeNull()
  })
})

describe('BR-85 checkBlocker', () => {
  // P ─ C ─ G (G is P's grandchild); S is C's sibling
  const parents: Record<string, string | null> = { P: null, C: 'P', S: 'P', G: 'C', X: null }
  const parentOf = (id: string) => parents[id] ?? null
  const check = (edges: readonly BlockerEdge[], blockerId: string, blockedId: string) =>
    checkBlocker({ edges, parentOf, blockerId, blockedId })

  it('self → SELF', () => {
    expect(check([], 'C', 'C')).toEqual({ reason: 'SELF' })
  })

  it('child blocks parent → ANCESTRY', () => {
    expect(check([], 'C', 'P')).toEqual({ reason: 'ANCESTRY' })
  })

  it('parent blocks child → ANCESTRY', () => {
    expect(check([], 'P', 'C')).toEqual({ reason: 'ANCESTRY' })
  })

  it('grandchild blocks grandparent → ANCESTRY', () => {
    expect(check([], 'G', 'P')).toEqual({ reason: 'ANCESTRY' })
  })

  it('grandparent blocks grandchild → ANCESTRY', () => {
    expect(check([], 'P', 'G')).toEqual({ reason: 'ANCESTRY' })
  })

  it('siblings → null', () => {
    expect(check([], 'C', 'S')).toBeNull()
  })

  it('nephew and uncle are not ancestry → null', () => {
    expect(check([], 'G', 'S')).toBeNull()
  })

  it('existing edge → DUPLICATE (before the cycle check)', () => {
    expect(check([e('S', 'X')], 'S', 'X')).toEqual({ reason: 'DUPLICATE' })
  })

  it('cycle → CYCLE with the path', () => {
    expect(check([e('S', 'X')], 'X', 'S')).toEqual({ reason: 'CYCLE', path: ['X', 'S', 'X'] })
  })

  it('SELF is reported before ANCESTRY, DUPLICATE and CYCLE', () => {
    expect(check([e('C', 'C')], 'C', 'C')).toEqual({ reason: 'SELF' })
  })

  it('ANCESTRY is reported before DUPLICATE', () => {
    expect(check([e('C', 'P')], 'C', 'P')).toEqual({ reason: 'ANCESTRY' })
  })
})

describe('BR-86 blockerBadge', () => {
  it.each([
    [{ open: 0, total: 0 }, null],
    [
      { open: 2, total: 3 },
      { kind: 'WAITING', open: 2 },
    ],
    [{ open: 0, total: 2 }, { kind: 'CLEARED' }],
    [
      { open: 1, total: 1 },
      { kind: 'WAITING', open: 1 },
    ],
  ] as const)('%j → %j', (counts, badge) => {
    expect(blockerBadge(counts)).toEqual(badge)
  })
})

describe('BR-85 property: accepting only cycle-free edges keeps the graph acyclic', () => {
  const NODES = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'] as const
  const node = fc.constantFrom(...NODES)

  it('accepted graph is acyclic; every reported path is a real cycle through the candidate edge', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(node, node), { maxLength: 40 }), (candidates) => {
        const accepted: BlockerEdge[] = []
        for (const [blockerId, blockedId] of candidates) {
          const path = wouldCreateCycle(accepted, blockerId, blockedId)
          if (path === null) {
            accepted.push(e(blockerId, blockedId))
            continue
          }
          expect(path[0]).toBe(blockerId)
          expect(path[path.length - 1]).toBe(blockerId)
          expect(path[1]).toBe(blockedId)
          for (let i = 1; i < path.length - 1; i++) {
            const from = path[i]
            const to = path[i + 1]
            expect(accepted.some((x) => x.blockerId === from && x.blockedId === to)).toBe(true)
          }
        }
        expect(isAcyclic(NODES, accepted)).toBe(true)
      }),
    )
  })
})
