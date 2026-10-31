import { describe, expect, it } from 'vitest'
import type { PageTreeNode } from '@/lib/contracts/pages'
import { EXPANDED_MAX, flattenPageTree, keyboardMoves, pageExpandKey, toggleExpanded } from './tree'

const node = (
  id: string,
  parentId: string | null,
  depth: number,
  position: string,
  hasChildren = false,
): PageTreeNode => ({
  id,
  parentId,
  title: id,
  icon: null,
  depth,
  position,
  hasChildren,
  locked: false,
  effectiveProtected: false,
  isCharter: false,
})

// roots [A(hasChildren), B], A → [A1(hasChildren)], A1 → [A11]
const A = node('A', null, 0, 'a0', true)
const B = node('B', null, 0, 'a1')
const A1 = node('A1', 'A', 1, 'a0', true)
const A11 = node('A11', 'A1', 2, 'a0')
const children = new Map<string, readonly PageTreeNode[]>([
  ['A', [A1]],
  ['A1', [A11]],
])

const flat = (expanded: string[]) => flattenPageTree([A, B], children, new Set(expanded))

describe('flattenPageTree (FR-503, M4-D23)', () => {
  it('expanded {A} → A, A1, B with depths 0, 1, 0', () => {
    const rows = flat(['A'])
    expect(rows.map((r) => r.id)).toEqual(['A', 'A1', 'B'])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 0])
    expect(rows.map((r) => r.parentId)).toEqual([null, 'A', null])
    expect(rows[1]?.node).toBe(A1)
  })

  it('expanded {A, A1} → A, A1, A11, B', () => {
    const rows = flat(['A', 'A1'])
    expect(rows.map((r) => r.id)).toEqual(['A', 'A1', 'A11', 'B'])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 0])
  })

  it('expanded {A1} only → A, B (a collapsed ancestor hides everything below)', () => {
    expect(flat(['A1']).map((r) => r.id)).toEqual(['A', 'B'])
  })

  it('an expanded node whose children are not loaded yet shows no children', () => {
    const rows = flattenPageTree([A, B], new Map(), new Set(['A']))
    expect(rows.map((r) => r.id)).toEqual(['A', 'B'])
  })

  it('keeps the server order of each level and carries position', () => {
    const rows = flattenPageTree([B, A], children, new Set())
    expect(rows.map((r) => [r.id, r.position])).toEqual([
      ['B', 'a1'],
      ['A', 'a0'],
    ])
  })

  it('no roots → []', () => {
    expect(flattenPageTree([], children, new Set(['A']))).toEqual([])
  })
})

describe('toggleExpanded (X05, sidebar.expanded)', () => {
  it('adds page:<id> and keeps project: values; closing removes it', () => {
    const opened = toggleExpanded(['project:p'], 'x', true)
    expect(opened).toEqual(['project:p', 'page:x'])
    expect(toggleExpanded(opened, 'x', false)).toEqual(['project:p'])
  })

  it('opening twice does not duplicate; closing an absent id is a no-op', () => {
    expect(toggleExpanded(['page:x'], 'x', true)).toEqual(['page:x'])
    expect(toggleExpanded(['project:p'], 'x', false)).toEqual(['project:p'])
  })

  it(`never exceeds ${EXPANDED_MAX} values: the oldest page: values go first, project: values stay`, () => {
    const pages = Array.from({ length: EXPANDED_MAX - 1 }, (_, i) => pageExpandKey(`p${i}`))
    const out = toggleExpanded(['project:a', ...pages], 'new', true)
    expect(out).toHaveLength(EXPANDED_MAX)
    const out2 = toggleExpanded(out, 'newer', true)
    expect(out2).toHaveLength(EXPANDED_MAX)
    expect(out2[0]).toBe('project:a')
    expect(out2).not.toContain('page:p0')
    expect(out2.at(-1)).toBe('page:newer')
  })
})

describe('keyboardMoves (FR-503 keyboard alternative to dragging)', () => {
  // A, A1, A11, B (A and A1 expanded); C is a third root
  const C = node('C', null, 0, 'a2')
  const rows = flattenPageTree([A, B, C], children, new Set(['A', 'A1']))

  it('a middle root: up before its previous sibling, down after the next, indent under it, no outdent', () => {
    expect(keyboardMoves(rows, 'B', 9)).toEqual({
      up: { parentId: null, afterId: null },
      down: { parentId: null, afterId: 'C' },
      indent: { parentId: 'A' },
      outdent: null,
    })
  })

  it('up from the third sibling goes after the first; the last sibling cannot go down', () => {
    const m = keyboardMoves(rows, 'C', 9)
    expect(m.up).toEqual({ parentId: null, afterId: 'A' })
    expect(m.down).toBeNull()
  })

  it('an only child: no up/down/indent; outdent lands right after its parent', () => {
    expect(keyboardMoves(rows, 'A11', 9)).toEqual({
      up: null,
      down: null,
      indent: null,
      outdent: { parentId: 'A', afterId: 'A1' },
    })
  })

  it('indent respects the depth cap including the loaded subtree', () => {
    // B (depth 0, no subtree) → depth 1: allowed with cap 1, refused with cap 0
    expect(keyboardMoves(rows, 'B', 1).indent).toEqual({ parentId: 'A' })
    expect(keyboardMoves(rows, 'B', 0).indent).toBeNull()
    // A has a 2-level loaded subtree; under nothing (first root) it cannot indent anyway
    expect(keyboardMoves(rows, 'A', 9).indent).toBeNull()
  })

  it('an unknown id → nothing', () => {
    expect(keyboardMoves(rows, 'zz', 9)).toEqual({ up: null, down: null, indent: null, outdent: null })
  })
})
