import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getProjection, removeChildrenOf, subtreeHeight, type FlatItem } from './tree-projection.ts'

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

test('subtree height', () => {
  assert.equal(subtreeHeight(items, 'D'), 2)
  assert.equal(subtreeHeight(items, 'A'), 1)
  assert.equal(subtreeHeight(items, 'F'), 0)
})
test('drag C right under B -> child of B', () => {
  assert.deepEqual(proj('C', 'C', 2 * I), { valid: true, depth: 2, parentId: 'B', prevSiblingId: null, nextSiblingId: null })
})
test('drag C left -> root level after A, before D', () => {
  assert.deepEqual(proj('C', 'C', -2 * I), { valid: true, depth: 0, parentId: null, prevSiblingId: 'A', nextSiblingId: 'D' })
})
test('drag D (height 2) between B and C: tasks cap = 2 -> D may only be depth 0 but next (C) needs >= 1 -> invalid', () => {
  assert.deepEqual(proj('D', 'C', 0), { valid: false })
})
test('drag D between B and C in a 10-level page tree -> valid at depth 1 (sibling of B, C)', () => {
  assert.deepEqual(proj('D', 'C', 0, 9), { valid: true, depth: 1, parentId: 'A', prevSiblingId: 'B', nextSiblingId: 'C' })
})
test('drag F (leaf) to top: depth clamps to 0, before A', () => {
  assert.deepEqual(proj('F', 'A', 3 * I), { valid: true, depth: 0, parentId: null, prevSiblingId: null, nextSiblingId: 'A' })
})
test('prev sibling skips deeper rows: drag D-level item after E subtree', () => {
  // move B (leaf) to the end (over F) at depth 1 -> sibling after E under D
  assert.deepEqual(proj('B', 'F', 0), { valid: true, depth: 1, parentId: 'D', prevSiblingId: 'E', nextSiblingId: null })
})
