import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  applyPlacement,
  childrenOf,
  compareKeys,
  currentPlacement,
  descendantIds,
  fitsDepth,
  flattenTree,
  indentTarget,
  moveDownTarget,
  moveUpTarget,
  outdentTarget,
  TASK_MAX_DEPTH_INDEX,
  type Placement,
} from './ops'
import { subtreeHeight, type FlatItem } from './projection'

const it_ = (id: string, parentId: string | null, depth: number, position: string): FlatItem => ({
  id,
  parentId,
  depth,
  position,
})
// A(B, C), D(E(F))
const fixture: FlatItem[] = [
  it_('A', null, 0, 'a0'),
  it_('B', 'A', 1, 'a0'),
  it_('C', 'A', 1, 'a1'),
  it_('D', null, 0, 'a1'),
  it_('E', 'D', 1, 'a0'),
  it_('F', 'E', 2, 'a0'),
]
const flat: FlatItem[] = [it_('R1', null, 0, 'a0'), it_('R2', null, 0, 'a1'), it_('R3', null, 0, 'a2')]
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id)

describe('compareKeys (X48 byte order)', () => {
  it.each([
    ['a0', 'a1', -1],
    ['a1', 'a0', 1],
    ['a0', 'a0', 0],
    ['Zz', 'a0', -1],
    ['a0V', 'a1', -1],
  ] as const)('%s vs %s → %i', (a, b, r) => {
    expect(compareKeys(a, b)).toBe(r)
  })
})

describe('flattenTree', () => {
  it("sorts siblings ['a1','a0V','Zz'] as Zz, a0V, a1 (byte order, not localeCompare)", () => {
    const out = flattenTree([
      { id: 'x', parentId: null, position: 'a1' },
      { id: 'y', parentId: null, position: 'a0V' },
      { id: 'z', parentId: null, position: 'Zz' },
    ])
    expect(out.map((n) => n.position)).toEqual(['Zz', 'a0V', 'a1'])
  })

  it('breaks position ties by id', () => {
    const out = flattenTree([
      { id: 'q', parentId: null, position: 'a0' },
      { id: 'p', parentId: null, position: 'a0' },
    ])
    expect(ids(out)).toEqual(['p', 'q'])
  })

  it('DFS with depths; input order does not matter; extra fields are kept', () => {
    const shuffled = [fixture[5], fixture[3], fixture[1], fixture[0], fixture[4], fixture[2]].map((n) => ({
      id: n!.id,
      parentId: n!.parentId,
      position: n!.position,
      tag: `t-${n!.id}`,
    }))
    const out = flattenTree(shuffled)
    expect(out.map((n) => [n.id, n.depth, n.tag])).toEqual([
      ['A', 0, 't-A'],
      ['B', 1, 't-B'],
      ['C', 1, 't-C'],
      ['D', 0, 't-D'],
      ['E', 1, 't-E'],
      ['F', 2, 't-F'],
    ])
  })

  it('drops orphans (parent missing) and their descendants', () => {
    const out = flattenTree([
      { id: 'A', parentId: null, position: 'a0' },
      { id: 'O', parentId: 'gone', position: 'a0' },
      { id: 'OC', parentId: 'O', position: 'a0' },
    ])
    expect(ids(out)).toEqual(['A'])
  })

  it('an empty list → []', () => {
    expect(flattenTree([])).toEqual([])
  })
})

describe('childrenOf / descendantIds / fitsDepth', () => {
  it('childrenOf lists direct children in order; null = roots', () => {
    expect(ids(childrenOf(fixture, 'A'))).toEqual(['B', 'C'])
    expect(ids(childrenOf(fixture, null))).toEqual(['A', 'D'])
    expect(childrenOf(fixture, 'F')).toEqual([])
  })

  it('descendantIds lists the subtree below a row in DFS order', () => {
    expect(descendantIds(fixture, 'D')).toEqual(['E', 'F'])
    expect(descendantIds(fixture, 'A')).toEqual(['B', 'C'])
    expect(descendantIds(fixture, 'C')).toEqual([])
    expect(descendantIds(fixture, 'Z')).toEqual([])
  })

  it('fitsDepth: newDepth + height ≤ max', () => {
    expect(fitsDepth(1, 1, 2)).toBe(true)
    expect(fitsDepth(1, 2, 2)).toBe(false)
    expect(fitsDepth(0, 2, 2)).toBe(true)
  })
})

describe('FR-603 / AC-602 indentTarget', () => {
  it('AC-602: row 2 + Tab → child of row 1', () => {
    expect(indentTarget(flat, 'R2', TASK_MAX_DEPTH_INDEX)).toEqual({ parentId: 'R1', afterId: null })
  })

  it('chain A > B > C: C has no previous sibling → null', () => {
    const chain = [it_('A', null, 0, 'a0'), it_('B', 'A', 1, 'a0'), it_('C', 'B', 2, 'a0')]
    expect(indentTarget(chain, 'C', 2)).toBeNull()
  })

  it('A > B, C (depth 1): C → child of B', () => {
    const tree = [it_('A', null, 0, 'a0'), it_('B', 'A', 1, 'a0'), it_('C', 'A', 1, 'a1')]
    expect(indentTarget(tree, 'C', 2)).toEqual({ parentId: 'B', afterId: null })
  })

  it('a fourth level → null (silent no-op)', () => {
    const tree = [
      it_('A', null, 0, 'a0'),
      it_('B', 'A', 1, 'a0'),
      it_('C', 'B', 2, 'a0'),
      it_('D', 'B', 2, 'a1'),
    ]
    expect(indentTarget(tree, 'D', 2)).toBeNull()
  })

  it('D (height 2) under A would be depth 1 + 2 = 3 → null', () => {
    expect(indentTarget(fixture, 'D', 2)).toBeNull()
  })

  it('C → child of B; B is a first child → null', () => {
    expect(indentTarget(fixture, 'C', 2)).toEqual({ parentId: 'B', afterId: null })
    expect(indentTarget(fixture, 'B', 2)).toBeNull()
  })

  it('appends after the previous sibling’s last child', () => {
    // A(B, C), D → indent D under A, after C
    const tree = [
      it_('A', null, 0, 'a0'),
      it_('B', 'A', 1, 'a0'),
      it_('C', 'A', 1, 'a1'),
      it_('D', null, 0, 'a1'),
    ]
    expect(indentTarget(tree, 'D', 2)).toEqual({ parentId: 'A', afterId: 'C' })
  })

  it('unknown id → null', () => {
    expect(indentTarget(fixture, 'Z', 2)).toBeNull()
  })
})

describe('FR-603 outdentTarget', () => {
  it('C → root, right after A', () => {
    expect(outdentTarget(fixture, 'C')).toEqual({ parentId: null, afterId: 'A' })
  })

  it('F → under D, right after E', () => {
    expect(outdentTarget(fixture, 'F')).toEqual({ parentId: 'D', afterId: 'E' })
  })

  it('a root row → null; unknown id → null', () => {
    expect(outdentTarget(fixture, 'A')).toBeNull()
    expect(outdentTarget(fixture, 'Z')).toBeNull()
  })

  it('a row whose parent is not in the list → null', () => {
    expect(outdentTarget([it_('X', 'gone', 1, 'a0')], 'X')).toBeNull()
  })
})

describe('moveUpTarget / moveDownTarget (row menu "ย้ายขึ้น / ย้ายลง")', () => {
  it('moveUp C → first child of A', () => {
    expect(moveUpTarget(fixture, 'C')).toEqual({ parentId: 'A', afterId: null })
  })

  it('moveUp of a third sibling → after the first', () => {
    expect(moveUpTarget(flat, 'R3')).toEqual({ parentId: null, afterId: 'R1' })
  })

  it('moveDown B → after C', () => {
    expect(moveDownTarget(fixture, 'B')).toEqual({ parentId: 'A', afterId: 'C' })
  })

  it('first / last sibling → null; unknown id → null', () => {
    expect(moveUpTarget(fixture, 'B')).toBeNull()
    expect(moveUpTarget(fixture, 'A')).toBeNull()
    expect(moveDownTarget(fixture, 'C')).toBeNull()
    expect(moveDownTarget(fixture, 'D')).toBeNull()
    expect(moveUpTarget(fixture, 'Z')).toBeNull()
    expect(moveDownTarget(fixture, 'Z')).toBeNull()
  })
})

describe('currentPlacement', () => {
  it('parent + previous sibling (null for a first child)', () => {
    expect(currentPlacement(fixture, 'C')).toEqual({ parentId: 'A', afterId: 'B' })
    expect(currentPlacement(fixture, 'B')).toEqual({ parentId: 'A', afterId: null })
    expect(currentPlacement(fixture, 'D')).toEqual({ parentId: null, afterId: 'A' })
  })

  it('unknown id → RangeError', () => {
    expect(() => currentPlacement(fixture, 'Z')).toThrow(RangeError)
  })
})

describe('applyPlacement (optimistic re-parent)', () => {
  it('E → root after A: order A B C E F D, E depth 0, F depth 1, provisional position on E', () => {
    const out = applyPlacement(fixture, 'E', { parentId: null, afterId: 'A' }, 'a0V')
    expect(ids(out)).toEqual(['A', 'B', 'C', 'E', 'F', 'D'])
    expect(out.find((x) => x.id === 'E')).toEqual({ id: 'E', parentId: null, depth: 0, position: 'a0V' })
    expect(out.find((x) => x.id === 'F')?.depth).toBe(1)
  })

  it('afterId null → first child of the parent', () => {
    const out = applyPlacement(fixture, 'C', { parentId: 'D', afterId: null }, 'Zz')
    expect(ids(out)).toEqual(['A', 'B', 'D', 'C', 'E', 'F'])
    expect(out.find((x) => x.id === 'C')).toMatchObject({ parentId: 'D', depth: 1 })
  })

  it('afterId null at the root → first row', () => {
    expect(ids(applyPlacement(fixture, 'D', { parentId: null, afterId: null }, 'Zz'))).toEqual([
      'D',
      'E',
      'F',
      'A',
      'B',
      'C',
    ])
  })

  it('indent result: the subtree moves deeper', () => {
    const out = applyPlacement(fixture, 'C', indentTarget(fixture, 'C', 2) as Placement, 'a1')
    expect(out.find((x) => x.id === 'C')).toMatchObject({ parentId: 'B', depth: 2 })
  })

  it('does not mutate its input', () => {
    const copy = structuredClone(fixture)
    applyPlacement(fixture, 'E', { parentId: null, afterId: 'A' }, 'a0V')
    expect(fixture).toEqual(copy)
  })

  it.each([
    ['unknown id', 'Z', { parentId: null, afterId: null }],
    ['unknown parent', 'B', { parentId: 'Z', afterId: null }],
    ['parent inside the moved subtree', 'D', { parentId: 'E', afterId: null }],
    ['parent = the row itself', 'D', { parentId: 'D', afterId: null }],
    ['afterId not a child of the parent', 'B', { parentId: 'D', afterId: 'C' }],
    ['afterId = the row itself', 'B', { parentId: 'A', afterId: 'B' }],
  ] as const)('%s → RangeError', (_label, id, to) => {
    expect(() => applyPlacement(fixture, id, to, 'x')).toThrow(RangeError)
  })

  it('property: targets applied keep a valid DFS tree within the depth cap', () => {
    const op = fc.constantFrom('indent', 'outdent', 'up', 'down')
    fc.assert(
      fc.property(fc.array(fc.tuple(op, fc.nat()), { maxLength: 25 }), (steps) => {
        let items: FlatItem[] = structuredClone(fixture)
        for (const [kind, n] of steps) {
          const id = (items[n % items.length] as FlatItem).id
          const to =
            kind === 'indent'
              ? indentTarget(items, id, 2)
              : kind === 'outdent'
                ? outdentTarget(items, id)
                : kind === 'up'
                  ? moveUpTarget(items, id)
                  : moveDownTarget(items, id)
          if (to === null) continue
          items = applyPlacement(items, id, to, 'p')
        }
        expect(items).toHaveLength(fixture.length)
        for (const [i, x] of items.entries()) {
          expect(x.depth).toBeLessThanOrEqual(2)
          if (x.parentId === null) expect(x.depth).toBe(0)
          else {
            // DFS: the parent is the nearest shallower row above
            const above = items.slice(0, i).reverse()
            const parent = above.find((p) => p.depth < x.depth)
            expect(parent?.id).toBe(x.parentId)
            expect(parent?.depth).toBe(x.depth - 1)
          }
          expect(subtreeHeight(items, x.id) + x.depth).toBeLessThanOrEqual(2)
        }
      }),
    )
  })
})
