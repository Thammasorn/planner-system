import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { GridResponse, GridRow, GridTaskRow } from '@/lib/contracts/grid'
import type { FlatItem } from '@/lib/tree/projection'
import { gridResponse, POS_PEOPLE, POS_TASKS, type FxTask } from './fixtures.test.data'
import { mergeChunks } from './merge'
import { applyRowMove, AUTOSCROLL_MAX_PX, autoscrollStep, dropTarget, pointerRowIndex, taskBlocks } from './row-drop'
import { buildViewRows } from './rows'

const INDENT = 24
const people = { ...POS_PEOPLE, jack: { name: 'Jack' } }
const open = { showCompleted: true, collapsed: new Set<string>() }

/** FlatItems in DFS order (positions a0, a1, …) as useProjectTasks would give them. */
const itemsOf = (tasks: FxTask[]): FlatItem[] =>
  tasks.map((t, i) => ({ id: t.id, parentId: t.parentId ?? null, depth: t.depth ?? 0, position: `a${i}` }))
const viewOf = (tasks: FxTask[], o: Partial<typeof open> & { showAssignees?: boolean } = {}) =>
  buildViewRows(mergeChunks([gridResponse({ from: '2026-08-31', tasks, people })])!, { ...open, ...o })

const POS_JACK: FxTask[] = POS_TASKS.map((t) =>
  t.id === 't-uat'
    ? { ...t, assignees: [...t.assignees, { taId: 'a-jack-uat', userId: 'jack', cells: { '2026-09-28': 100 } }] }
    : t,
)

describe('taskBlocks (BR-105: assignee rows belong to the task above)', () => {
  it('golden POS merged rows → one row per block', () => {
    expect(taskBlocks(viewOf(POS_TASKS))).toEqual([
      { taskId: 't-pos', firstIndex: 0, lastIndex: 0, depth: 0 },
      { taskId: 't-uat', firstIndex: 1, lastIndex: 1, depth: 0 },
      { taskId: 't-rollout', firstIndex: 2, lastIndex: 2, depth: 0 },
    ])
  })
  it('a task with two assignees spans its task row + assignee rows', () => {
    expect(taskBlocks(viewOf(POS_JACK)).map((b) => [b.taskId, b.firstIndex, b.lastIndex])).toEqual([
      ['t-pos', 0, 0],
      ['t-uat', 1, 3],
      ['t-rollout', 4, 4],
    ])
  })
  it('hidden assignee column → sum rows, one per block', () => {
    expect(taskBlocks(viewOf(POS_JACK, { showAssignees: false })).map((b) => b.lastIndex - b.firstIndex)).toEqual([0, 0, 0])
  })
})

describe('dropTarget (FR-815, M7.1-D16)', () => {
  const base = { items: itemsOf(POS_JACK), indentPx: INDENT, dx: 0 }

  it('move "Rollout สาขา" to the top → { parentId: null, afterId: null }', () => {
    const viewRows = viewOf(POS_TASKS)
    expect(
      dropTarget({ ...base, items: itemsOf(POS_TASKS), viewRows, activeTaskId: 't-rollout', pointerIndex: 0 }),
    ).toEqual({ placement: { parentId: null, afterId: null }, depth: 0, indicatorIndex: 0, valid: true })
  })
  it('drop over Ivy’s assignee row = after the "ทำ UAT" block (dragging down)', () => {
    const viewRows = viewOf(POS_JACK)
    expect(dropTarget({ ...base, viewRows, activeTaskId: 't-pos', pointerIndex: 2 })).toEqual({
      placement: { parentId: null, afterId: 't-uat' },
      depth: 0,
      indicatorIndex: 4,
      valid: true,
    })
  })
  it('dragging up over an assignee row also lands after that block (here: no-op for Rollout)', () => {
    const viewRows = viewOf(POS_JACK)
    const r = dropTarget({ ...base, viewRows, activeTaskId: 't-rollout', pointerIndex: 3 })
    expect(r).toEqual({ placement: null, depth: 0, indicatorIndex: 4, valid: true })
    // over the task row itself (dragging up) → before it
    expect(dropTarget({ ...base, viewRows, activeTaskId: 't-rollout', pointerIndex: 1 }).placement).toEqual({
      parentId: null,
      afterId: 't-pos',
    })
  })
  it('dx = +1 indent under a leaf → parentId = that leaf', () => {
    const viewRows = viewOf(POS_JACK)
    expect(dropTarget({ ...base, viewRows, activeTaskId: 't-uat', pointerIndex: 1, dx: INDENT })).toEqual({
      placement: { parentId: 't-pos', afterId: null },
      depth: 1,
      indicatorIndex: 1,
      valid: true,
    })
  })
  it('a subtree of height 2 cannot be indented (BR-30) → no move', () => {
    const tree: FxTask[] = [
      { id: 'x', name: 'x', assignees: [] },
      { id: 'a', name: 'a', assignees: [] },
      { id: 'b', name: 'b', parentId: 'a', depth: 1, assignees: [] },
      { id: 'c', name: 'c', parentId: 'b', depth: 2, assignees: [] },
    ]
    const r = dropTarget({ viewRows: viewOf(tree), items: itemsOf(tree), activeTaskId: 'a', pointerIndex: 1, dx: INDENT, indentPx: INDENT })
    expect(r.placement).toBeNull()
    expect(r.depth).toBe(0)
  })
  it('no drop inside the active subtree: pointer over a descendant → no move', () => {
    const tree: FxTask[] = [
      { id: 'a', name: 'a', assignees: [] },
      { id: 'b', name: 'b', parentId: 'a', depth: 1, assignees: [] },
      { id: 'z', name: 'z', assignees: [] },
    ]
    const r = dropTarget({ viewRows: viewOf(tree), items: itemsOf(tree), activeTaskId: 'a', pointerIndex: 1, dx: 0, indentPx: INDENT })
    expect(r.placement).toBeNull()
    expect(r.indicatorIndex).toBe(0)
  })
  it('a child dragged out to the root after its parent block', () => {
    const tree: FxTask[] = [
      { id: 'a', name: 'a', assignees: [] },
      { id: 'b', name: 'b', parentId: 'a', depth: 1, assignees: [] },
      { id: 'c', name: 'c', parentId: 'a', depth: 1, assignees: [] },
      { id: 'z', name: 'z', assignees: [] },
    ]
    const r = dropTarget({ viewRows: viewOf(tree), items: itemsOf(tree), activeTaskId: 'b', pointerIndex: 2, dx: 0, indentPx: INDENT })
    expect(r).toEqual({ placement: { parentId: 'a', afterId: 'c' }, depth: 1, indicatorIndex: 3, valid: true })
    const out = dropTarget({ viewRows: viewOf(tree), items: itemsOf(tree), activeTaskId: 'c', pointerIndex: 2, dx: -INDENT, indentPx: INDENT })
    expect(out.placement).toEqual({ parentId: null, afterId: 'a' })
  })
  it('pointer past either edge → first / last block; unknown task → invalid', () => {
    const viewRows = viewOf(POS_JACK)
    expect(dropTarget({ ...base, viewRows, activeTaskId: 't-pos', pointerIndex: 99 }).placement).toEqual({
      parentId: null,
      afterId: 't-rollout',
    })
    expect(dropTarget({ ...base, viewRows, activeTaskId: 't-rollout', pointerIndex: -4 }).placement).toEqual({
      parentId: null,
      afterId: null,
    })
    expect(dropTarget({ ...base, viewRows, activeTaskId: 'nope', pointerIndex: 0 })).toEqual({
      placement: null,
      depth: 0,
      indicatorIndex: -1,
      valid: false,
    })
  })
  it('hidden tasks are not touched: dropping in place next to a hidden sibling is a no-op', () => {
    const tree: FxTask[] = [
      { id: 'a', name: 'a', assignees: [] },
      { id: 'h', name: 'h', completedWeek: '2026-09-07', assignees: [] },
      { id: 'b', name: 'b', assignees: [] },
    ]
    const viewRows = viewOf(tree, { showCompleted: false })
    expect(viewRows.map((r) => r.task.id)).toEqual(['a', 'b'])
    expect(dropTarget({ viewRows, items: itemsOf(tree), activeTaskId: 'b', pointerIndex: 1, dx: 0, indentPx: INDENT }).placement).toBeNull()
    expect(dropTarget({ viewRows, items: itemsOf(tree), activeTaskId: 'b', pointerIndex: 0, dx: 0, indentPx: INDENT }).placement).toEqual({
      parentId: null,
      afterId: null,
    })
  })
  it('invalid projection (no depth fits) → valid false', () => {
    // dragging a height-2 subtree between a parent and its child: the next row forces depth ≥ 1, the cap allows 0
    const tree: FxTask[] = [
      { id: 'p', name: 'p', assignees: [] },
      { id: 'q', name: 'q', parentId: 'p', depth: 1, assignees: [] },
      { id: 'a', name: 'a', assignees: [] },
      { id: 'b', name: 'b', parentId: 'a', depth: 1, assignees: [] },
      { id: 'c', name: 'c', parentId: 'b', depth: 2, assignees: [] },
    ]
    const r = dropTarget({ viewRows: viewOf(tree), items: itemsOf(tree), activeTaskId: 'a', pointerIndex: 1, dx: 0, indentPx: INDENT })
    expect(r.valid).toBe(false)
    expect(r.placement).toBeNull()
  })
})

const ids = (rows: GridRow[]) => rows.map((r) => (r.kind === 'task' ? `t:${r.id}` : r.kind === 'assignee' ? `a:${r.taskAssignmentId}` : r.kind))
const taskOf = (resp: GridResponse, id: string) => resp.rows.find((r): r is GridTaskRow => r.kind === 'task' && r.id === id)!

describe('applyRowMove (M7.1-D18)', () => {
  const TREE: FxTask[] = [
    { id: 'p', name: 'p', assignees: [] },
    { id: 'c1', name: 'c1', parentId: 'p', depth: 1, assignees: [{ taId: 'x1', userId: 'cindy', cells: { '2026-09-28': 100 } }] },
    { id: 'c2', name: 'c2', parentId: 'p', depth: 1, assignees: [{ taId: 'x2', userId: 'ivy', cells: { '2026-09-28': 200 } }] },
    { id: 'z', name: 'z', assignees: [{ taId: 'xz', userId: 'mint', cells: { '2026-09-28': 50 } }] },
  ]
  const resp = () => gridResponse({ from: '2026-09-28', tasks: TREE, people })

  it('moves "Rollout สาขา" (with its assignee row) to the top', () => {
    const r = gridResponse({ from: '2026-08-31', tasks: POS_JACK, people })
    const out = applyRowMove(r, { taskId: 't-rollout', parentId: null, afterId: null })
    expect(ids(out.rows)).toEqual(['t:t-rollout', 'a:a-mint-rollout', 't:t-pos', 'a:a-cindy-pos', 't:t-uat', 'a:a-ivy-uat', 'a:a-jack-uat'])
    expect(ids(r.rows)[0]).toBe('t:t-pos') // input untouched
  })
  it('re-parents a leaf under another task: parentId, depth, hasChildren and totals rewritten', () => {
    const out = applyRowMove(resp(), { taskId: 'z', parentId: 'p', afterId: 'c1' })
    expect(ids(out.rows)).toEqual(['t:p', 't:c1', 'a:x1', 't:z', 'a:xz', 't:c2', 'a:x2'])
    expect(taskOf(out, 'z')).toMatchObject({ parentId: 'p', depth: 1 })
    expect(taskOf(out, 'p').totals['W:2026-09-28']).toEqual({ total: 350, committed: 350 })
  })
  it('moving the last children out clears the old parent’s hasChildren and totals', () => {
    let out = applyRowMove(resp(), { taskId: 'c1', parentId: null, afterId: 'z' })
    out = applyRowMove(out, { taskId: 'c2', parentId: null, afterId: 'c1' })
    expect(ids(out.rows)).toEqual(['t:p', 't:z', 'a:xz', 't:c1', 'a:x1', 't:c2', 'a:x2'])
    expect(taskOf(out, 'p')).toMatchObject({ hasChildren: false, totals: {} })
    expect(taskOf(out, 'c1').depth).toBe(0)
  })
  it('moves a whole subtree and shifts every depth', () => {
    const out = applyRowMove(resp(), { taskId: 'p', parentId: 'z', afterId: null })
    expect(ids(out.rows)).toEqual(['t:z', 'a:xz', 't:p', 't:c1', 'a:x1', 't:c2', 'a:x2'])
    expect([taskOf(out, 'p').depth, taskOf(out, 'c1').depth, taskOf(out, 'c2').depth]).toEqual([1, 2, 2])
    expect(taskOf(out, 'z').hasChildren).toBe(true)
  })
  it('invalid moves return the response unchanged', () => {
    const r = resp()
    expect(applyRowMove(r, { taskId: 'nope', parentId: null, afterId: null })).toBe(r)
    expect(applyRowMove(r, { taskId: 'p', parentId: 'c1', afterId: null })).toBe(r) // into its own subtree
    expect(applyRowMove(r, { taskId: 'z', parentId: null, afterId: 'c1' })).toBe(r) // afterId not a child of parentId
    expect(applyRowMove(r, { taskId: 'p', parentId: 'z', afterId: 'nope' })).toBe(r)
    // too deep (BR-30): z under c1 makes c1 height 1; c1 under c2 would reach depth 3
    const deep = applyRowMove(r, { taskId: 'z', parentId: 'c1', afterId: null })
    expect(taskOf(deep, 'z').depth).toBe(2)
    expect(applyRowMove(deep, { taskId: 'c1', parentId: 'c2', afterId: null })).toBe(deep)
  })
  it('property: every row is kept exactly once and assignee rows follow their task', () => {
    const all = ['p', 'c1', 'c2', 'z']
    fc.assert(
      fc.property(
        fc.constantFrom(...all),
        fc.option(fc.constantFrom(...all), { nil: null }),
        fc.option(fc.constantFrom(...all), { nil: null }),
        (taskId, parentId, afterId) => {
          const r = resp()
          const out = applyRowMove(r, { taskId, parentId, afterId })
          expect([...ids(out.rows)].sort()).toEqual([...ids(r.rows)].sort())
          let current: string | null = null
          for (const row of out.rows) {
            if (row.kind === 'task') current = row.id
            else if (row.kind === 'assignee') expect(row.taskId).toBe(current)
          }
        },
      ),
    )
  })
})

describe('pointerRowIndex / autoscrollStep (M7.1-D16)', () => {
  it('maps a pointer to the uniform-height row under it, including the scroll offset and the header', () => {
    const o = { scrollerTop: 100, scrollTop: 0, headerH: 64, rowH: 32 }
    expect(pointerRowIndex({ ...o, clientY: 164 })).toBe(0)
    expect(pointerRowIndex({ ...o, clientY: 195 })).toBe(0)
    expect(pointerRowIndex({ ...o, clientY: 196 })).toBe(1)
    expect(pointerRowIndex({ ...o, clientY: 164, scrollTop: 320 })).toBe(10)
    expect(pointerRowIndex({ ...o, clientY: 120 })).toBeLessThan(0)
  })
  it('scrolls only inside the 40 px edge zones, at most 12 px per frame, towards the edge', () => {
    expect(autoscrollStep(300, 100, 600)).toBe(0)
    expect(autoscrollStep(100, 100, 600)).toBe(-AUTOSCROLL_MAX_PX)
    expect(autoscrollStep(40, 100, 600)).toBe(-AUTOSCROLL_MAX_PX)
    expect(autoscrollStep(600, 100, 600)).toBe(AUTOSCROLL_MAX_PX)
    const near = autoscrollStep(120, 100, 600)
    expect(near).toBeLessThan(0)
    expect(near).toBeGreaterThan(-AUTOSCROLL_MAX_PX)
    expect(autoscrollStep(139, 100, 600)).toBe(-1)
    expect(autoscrollStep(140, 100, 600)).toBe(0)
    expect(autoscrollStep(110, 100, 150)).toBe(0) // body too short: no autoscroll
  })
})
