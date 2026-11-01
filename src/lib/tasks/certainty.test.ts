import { describe, expect, it } from 'vitest'
import type { TaskDTO } from '@/lib/contracts/tasks'
import { taskCertainty } from './certainty'

const task = (id: string, parentId: string | null, x: Partial<TaskDTO> = {}): TaskDTO => ({
  id,
  projectId: 'p1',
  parentId,
  depth: 0,
  position: 'a0',
  name: `name-${id}`,
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
const mapOf = (ts: TaskDTO[]) => new Map(ts.map((t) => [t.id, t]))

describe('BR-35/36 taskCertainty (chain from the task map)', () => {
  const byId = mapOf([
    task('G', null, { certaintyOverride: 'TENTATIVE', name: 'Rollout สาขา' }),
    task('P', 'G'),
    task('T', 'P'),
    task('X', null),
    task('Y', 'X', { certaintyOverride: 'CONFIRMED' }),
  ])

  it('a grandchild inherits the grandparent override', () => {
    expect(taskCertainty(byId, 'T', 'CONFIRMED')).toEqual({
      value: 'TENTATIVE',
      source: 'ancestor',
      sourceTaskId: 'G',
      sourceTaskName: 'Rollout สาขา',
    })
  })

  it('own override wins', () => {
    expect(taskCertainty(byId, 'Y', 'TENTATIVE')).toMatchObject({ value: 'CONFIRMED', source: 'task' })
  })

  it('no override anywhere → the project', () => {
    expect(taskCertainty(byId, 'X', 'TENTATIVE')).toEqual({
      value: 'TENTATIVE',
      source: 'project',
      sourceTaskId: null,
      sourceTaskName: null,
    })
  })

  it('a parent missing from the map ends the chain', () => {
    expect(taskCertainty(mapOf([task('T', 'gone')]), 'T', 'CONFIRMED').source).toBe('project')
  })

  it('the chain is capped at 3 nodes even for malformed deeper data', () => {
    const deep = mapOf([
      task('R', null, { certaintyOverride: 'TENTATIVE' }),
      task('A', 'R'),
      task('B', 'A'),
      task('C', 'B'),
    ])
    expect(taskCertainty(deep, 'C', 'CONFIRMED')).toMatchObject({ value: 'CONFIRMED', source: 'project' })
  })

  it('an unknown task id → RangeError', () => {
    expect(() => taskCertainty(byId, 'missing', 'CONFIRMED')).toThrow(RangeError)
  })
})
