import { describe, expect, it } from 'vitest'
import type { TaskDTO, TaskDepth, TaskStatusDTO } from '@/lib/contracts/tasks'
import type { TaskStatusCategory } from '@/domain/types'
import {
  patchAssign,
  patchBlockers,
  patchCreate,
  patchMove,
  patchRemoveTree,
  patchRevertStatus,
  patchStatus,
  patchTransfer,
  patchUnassign,
  patchUpdate,
} from './optimistic'

const TODAY = '2026-09-30'
const task = (id: string, parentId: string | null, depth: number, x: Partial<TaskDTO> = {}): TaskDTO => ({
  id,
  projectId: 'p1',
  parentId,
  depth: depth as TaskDepth,
  position: 'a0',
  name: id,
  hasBody: false,
  startDate: null,
  dueDate: null,
  certaintyOverride: null,
  completedOn: null,
  assignees: [],
  statusId: 'todo',
  blockers: { open: 0, total: 0 },
  ...x,
})
const st = (id: string, category: TaskStatusCategory): TaskStatusDTO => ({
  id,
  projectId: 'p1',
  name: id,
  color: '#94A3B8',
  category,
  position: 'a0',
})
const CATS: Record<string, TaskStatusCategory> = {
  todo: 'TODO',
  doing: 'IN_PROGRESS',
  done: 'DONE',
  archive: 'DONE',
}
const categoryOf = (id: string): TaskStatusCategory => CATS[id] ?? 'TODO'
const byId = (ts: readonly TaskDTO[], id: string) => ts.find((t) => t.id === id)
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id)
const as = (assignmentId: string, userId: string) => ({ assignmentId, userId })

// A(B), X(Y(Z)), Q
const base: TaskDTO[] = [
  task('A', null, 0),
  task('B', 'A', 1),
  task('X', null, 0, { position: 'a1' }),
  task('Y', 'X', 1),
  task('Z', 'Y', 2),
  task('Q', null, 0, { position: 'a2' }),
]

describe('patchCreate / patchUpdate', () => {
  it('appends a new task and replaces one with the same id', () => {
    const t = task('N', null, 0, { position: 'a3' })
    expect(ids(patchCreate(base, t))).toEqual([...ids(base), 'N'])
    const renamed = { ...base[0]!, name: 'renamed' }
    const out = patchCreate(base, renamed)
    expect(out).toHaveLength(base.length)
    expect(byId(out, 'A')?.name).toBe('renamed')
  })

  it('patchUpdate merges the patch into one task only', () => {
    const out = patchUpdate(base, 'B', { name: 'b2', dueDate: '2026-10-01' })
    expect(byId(out, 'B')).toMatchObject({ name: 'b2', dueDate: '2026-10-01', parentId: 'A' })
    expect(byId(out, 'A')).toBe(base[0])
  })
})

describe('patchMove (fixes descendant depths)', () => {
  it('moving a 2-level subtree under a depth-0 task → its child ends at depth 2', () => {
    // X(Y(Z)) has height 2; move Y(Z) under Q
    const out = patchMove(base, 'Y', { parentId: 'Q', afterId: null }, 'a0')
    expect(byId(out, 'Y')).toMatchObject({ parentId: 'Q', depth: 1, position: 'a0' })
    expect(byId(out, 'Z')).toMatchObject({ parentId: 'Y', depth: 2 })
  })

  it('outdent to the root → depth 0 and the child follows', () => {
    const out = patchMove(base, 'Y', { parentId: null, afterId: 'X' }, 'a1V')
    expect(byId(out, 'Y')).toMatchObject({ parentId: null, depth: 0, position: 'a1V' })
    expect(byId(out, 'Z')?.depth).toBe(1)
    expect(byId(out, 'A')).toBe(base[0])
  })

  it('an unknown task id → unchanged list', () => {
    expect(patchMove(base, 'missing', { parentId: null, afterId: null }, 'a0')).toEqual(base)
  })

  it('an unknown parent puts the task at depth 0', () => {
    expect(byId(patchMove(base, 'B', { parentId: 'gone', afterId: null }, 'a0'), 'B')?.depth).toBe(0)
  })
})

describe('patchRemoveTree', () => {
  it("['X'] removes X and its descendants only", () => {
    expect(ids(patchRemoveTree(base, ['X']))).toEqual(['A', 'B', 'Q'])
  })

  it('several roots and unknown ids', () => {
    expect(ids(patchRemoveTree(base, ['B', 'Y', 'missing']))).toEqual(['A', 'X', 'Q'])
  })
})

describe('BR-80 patchStatus / patchRevertStatus', () => {
  const tasks = [
    task('open', null, 0),
    task('doneEarlier', null, 0, { statusId: 'archive', completedOn: '2026-09-28' }),
    task('other', null, 0),
  ]

  it('to a DONE status: completedOn = today only for non-DONE rows; DONE→DONE keeps the date', () => {
    const out = patchStatus(tasks, ['open', 'doneEarlier'], st('done', 'DONE'), categoryOf, TODAY)
    expect(byId(out, 'open')).toMatchObject({ statusId: 'done', completedOn: TODAY })
    expect(byId(out, 'doneEarlier')).toMatchObject({ statusId: 'done', completedOn: '2026-09-28' })
    expect(byId(out, 'other')).toBe(tasks[2])
  })

  it('to TODO clears completedOn', () => {
    const out = patchStatus(tasks, ['doneEarlier'], st('todo', 'TODO'), categoryOf, TODAY)
    expect(byId(out, 'doneEarlier')).toMatchObject({ statusId: 'todo', completedOn: null })
  })

  it('patchRevertStatus restores both fields exactly', () => {
    const changed = patchStatus(tasks, ['open', 'doneEarlier'], st('todo', 'TODO'), categoryOf, TODAY)
    const reverted = patchRevertStatus(changed, [
      { taskId: 'open', statusId: 'todo', completedOn: null },
      { taskId: 'doneEarlier', statusId: 'archive', completedOn: '2026-09-28' },
    ])
    expect(reverted).toEqual(tasks)
  })
})

describe('BR-86 patchBlockers', () => {
  it('A blocked by B, B done → A { open: 0, total: 1 }; counts reset for tasks without edges', () => {
    const tasks = [
      task('A', null, 0, { blockers: { open: 1, total: 1 } }),
      task('B', null, 0, { statusId: 'done', completedOn: TODAY }),
      task('C', null, 0, { blockers: { open: 2, total: 2 } }),
    ]
    const out = patchBlockers(tasks, [{ id: 'e1', taskId: 'A', blockerTaskId: 'B' }], categoryOf)
    expect(byId(out, 'A')?.blockers).toEqual({ open: 0, total: 1 })
    expect(byId(out, 'B')?.blockers).toEqual({ open: 0, total: 0 })
    expect(byId(out, 'C')?.blockers).toEqual({ open: 0, total: 0 })
  })

  it('open blockers count; edges to tasks no longer in the list are ignored', () => {
    const tasks = [task('A', null, 0), task('B', null, 0), task('C', null, 0, { statusId: 'doing' })]
    const out = patchBlockers(
      tasks,
      [
        { id: 'e1', taskId: 'A', blockerTaskId: 'B' },
        { id: 'e2', taskId: 'A', blockerTaskId: 'C' },
        { id: 'e3', taskId: 'A', blockerTaskId: 'deleted' },
      ],
      categoryOf,
    )
    expect(byId(out, 'A')?.blockers).toEqual({ open: 2, total: 2 })
    expect(byId(out, 'B')).toBe(tasks[1]) // unchanged counts keep the object
  })
})

describe('FR-610 / M3-D3 patchTransfer', () => {
  it('moves the assignee objects from one task to another', () => {
    const tasks = [
      task('P', null, 0, { assignees: [as('as1', 'cindy'), as('as2', 'ivy'), as('as3', 'mint')] }),
      task('C', 'P', 1, { assignees: [as('as9', 'jack')] }),
    ]
    const out = patchTransfer(tasks, { assignmentIds: ['as1', 'as3'], fromTaskId: 'P', toTaskId: 'C' })
    expect(byId(out, 'P')?.assignees).toEqual([as('as2', 'ivy')])
    expect(byId(out, 'C')?.assignees).toEqual([as('as9', 'jack'), as('as1', 'cindy'), as('as3', 'mint')])
  })

  it('tasks other than from/to keep their identity; an id already on the target is not duplicated', () => {
    const tasks = [
      task('P', null, 0, { assignees: [as('as1', 'cindy')] }),
      task('C', 'P', 1, { assignees: [as('as1', 'cindy')] }),
      task('Q', null, 0),
    ]
    const out = patchTransfer(tasks, { assignmentIds: ['as1'], fromTaskId: 'P', toTaskId: 'C' })
    expect(byId(out, 'C')?.assignees).toEqual([as('as1', 'cindy')])
    expect(byId(out, 'Q')).toBe(tasks[2])
  })

  it('a transfer and its reverse give back the original', () => {
    const tasks = [task('P', null, 0, { assignees: [as('as1', 'cindy')] }), task('C', 'P', 1)]
    const t = { assignmentIds: ['as1'], fromTaskId: 'P', toTaskId: 'C' }
    const there = patchTransfer(tasks, t)
    expect(patchTransfer(there, { assignmentIds: ['as1'], fromTaskId: 'C', toTaskId: 'P' })).toEqual(tasks)
  })

  it('an unknown source task → unchanged', () => {
    expect(patchTransfer(base, { assignmentIds: ['x'], fromTaskId: 'missing', toTaskId: 'A' })).toEqual(base)
  })
})

describe('FR-605 / M3-D13 patchAssign / patchUnassign', () => {
  const tasks = [
    task('P', null, 0),
    task('L1', 'P', 1),
    task('L2', 'P', 1, { assignees: [as('old', 'cindy')] }),
    task('L3', null, 0),
  ]

  it('adds the user to leaves; skips parents and tasks already assigned to that user', () => {
    const out = patchAssign(tasks, ['P', 'L1', 'L2'], { userId: 'cindy', assignmentIdFor: (id) => `tmp-${id}` })
    expect(byId(out, 'P')?.assignees).toEqual([])
    expect(byId(out, 'L1')?.assignees).toEqual([as('tmp-L1', 'cindy')])
    expect(byId(out, 'L2')?.assignees).toEqual([as('old', 'cindy')])
    expect(byId(out, 'L3')).toBe(tasks[3])
  })

  it('patchUnassign removes those assignment ids wherever they are', () => {
    const assigned = patchAssign(tasks, ['L1', 'L3'], { userId: 'ivy', assignmentIdFor: (id) => `a-${id}` })
    const out = patchUnassign(assigned, ['a-L1', 'old'])
    expect(byId(out, 'L1')?.assignees).toEqual([])
    expect(byId(out, 'L2')?.assignees).toEqual([])
    expect(byId(out, 'L3')?.assignees).toEqual([as('a-L3', 'ivy')])
  })
})
