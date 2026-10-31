import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { getProjection, removeChildrenOf, subtreeHeight, type FlatItem } from './projection'

const I = 20
// A
//   B
//   C
// D
//   E
//     F
const items: FlatItem[] = [
  { id: 'A', parentId: null, depth: 0, position: 'a0' },
  { id: 'B', parentId: 'A', depth: 1, position: 'a0' },
  { id: 'C', parentId: 'A', depth: 1, position: 'a1' },
  { id: 'D', parentId: null, depth: 0, position: 'a1' },
  { id: 'E', parentId: 'D', depth: 1, position: 'a0' },
  { id: 'F', parentId: 'E', depth: 2, position: 'a0' },
]
const proj = (active: string, over: string, dx: number, max = 2) => {
  const visible = removeChildrenOf(items, [active])
  return getProjection(visible, active, over, dx, I, max, subtreeHeight(items, active))
}

/** A DFS-ordered tree from a depth sequence (each depth ≤ previous + 1). */
function fromDepths(depths: readonly number[]): FlatItem[] {
  const stack: string[] = []
  return depths.map((depth, i) => {
    const id = `n${i}`
    stack.length = depth
    const parentId = depth === 0 ? null : (stack[depth - 1] ?? null)
    stack[depth] = id
    return { id, parentId, depth, position: `a${i}` }
  })
}

const arbTree = fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 12 }).map((raw) => {
  const depths: number[] = []
  for (const d of raw)
    depths.push(Math.min(d, depths.length === 0 ? 0 : (depths[depths.length - 1] ?? 0) + 1))
  return fromDepths(depths)
})

describe('FR-604 tree projection (r4 §18)', () => {
  it('subtree height', () => {
    expect(subtreeHeight(items, 'D')).toBe(2)
    expect(subtreeHeight(items, 'A')).toBe(1)
    expect(subtreeHeight(items, 'F')).toBe(0)
  })

  it('drag C right under B → child of B', () => {
    expect(proj('C', 'C', 2 * I)).toEqual({
      valid: true,
      depth: 2,
      parentId: 'B',
      prevSiblingId: null,
      nextSiblingId: null,
    })
  })

  it('drag C left → root level after A, before D', () => {
    expect(proj('C', 'C', -2 * I)).toEqual({
      valid: true,
      depth: 0,
      parentId: null,
      prevSiblingId: 'A',
      nextSiblingId: 'D',
    })
  })

  it('drag D (height 2) between B and C: tasks cap = 2 → D may only be depth 0 but next (C) needs ≥ 1 → invalid', () => {
    expect(proj('D', 'C', 0)).toEqual({ valid: false })
  })

  it('drag D between B and C in a 10-level page tree → valid at depth 1 (sibling of B, C)', () => {
    expect(proj('D', 'C', 0, 9)).toEqual({
      valid: true,
      depth: 1,
      parentId: 'A',
      prevSiblingId: 'B',
      nextSiblingId: 'C',
    })
  })

  it('drag F (leaf) to top: depth clamps to 0, before A', () => {
    expect(proj('F', 'A', 3 * I)).toEqual({
      valid: true,
      depth: 0,
      parentId: null,
      prevSiblingId: null,
      nextSiblingId: 'A',
    })
  })

  it('prev sibling skips deeper rows: drag B over F → sibling after E under D', () => {
    expect(proj('B', 'F', 0)).toEqual({
      valid: true,
      depth: 1,
      parentId: 'D',
      prevSiblingId: 'E',
      nextSiblingId: null,
    })
  })

  it('unknown active or over id → invalid', () => {
    expect(getProjection(items, 'Z', 'A', 0, I, 2, 0)).toEqual({ valid: false })
    expect(getProjection(items, 'A', 'Z', 0, I, 2, 0)).toEqual({ valid: false })
    expect(subtreeHeight(items, 'Z')).toBe(0)
  })

  it('property: a valid projection never has depth + subtreeHeight > maxDepthIndex (BR-30)', () => {
    fc.assert(
      fc.property(arbTree, fc.nat(), fc.nat(), fc.integer({ min: -4, max: 4 }), (tree, a, o, steps) => {
        const active = tree[a % tree.length] as FlatItem
        const visible = removeChildrenOf(tree, [active.id])
        const over = visible[o % visible.length] as FlatItem
        const height = subtreeHeight(tree, active.id)
        const p = getProjection(visible, active.id, over.id, steps * I, I, 2, height)
        if (!p.valid) return
        expect(p.depth + height).toBeLessThanOrEqual(2)
        expect(p.depth).toBeGreaterThanOrEqual(0)
        if (p.parentId !== null) {
          const parent = visible.find((x) => x.id === p.parentId)
          expect(parent?.depth).toBe(p.depth - 1)
        } else {
          expect(p.depth).toBe(0)
        }
      }),
    )
  })
})
