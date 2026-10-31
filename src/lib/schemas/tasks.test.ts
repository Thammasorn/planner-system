import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import {
  addTaskBlockerSchema,
  completeTaskSchema,
  createTaskSchema,
  restoreRemovedMemberSchema,
  revertTaskStatusSchema,
  setTaskStatusSchema,
  taskPatchSchema,
  teamTasksQueryFromSearchParams,
  teamTasksQuerySchema,
  teamTasksSearchParams,
  updateTaskSchema,
  updateTaskStatusSchema,
  zStatusColor,
  zStatusName,
  zTaskName,
} from './tasks'

const P = '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f'
const T = '0b7f6a52-9c1e-4d3b-a2f4-5e6d7c8b9a01'

function firstError(r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) {
  return r.error?.issues[0]
}

describe('task schemas (plan/m03 S0.4, M3-D15)', () => {
  it('trims names; blank → nameRequired; 501 chars → nameTooLong; NBSP-only is blank (R7)', () => {
    expect(zTaskName.parse('  งาน ก  ')).toBe('งาน ก')
    expect(firstError(zTaskName.safeParse(' '))?.message).toBe(th.tasks.errors.nameRequired)
    expect(firstError(zTaskName.safeParse('  '))?.message).toBe(th.tasks.errors.nameRequired)
    expect(firstError(zTaskName.safeParse('ก'.repeat(501)))?.message).toBe(th.tasks.errors.nameTooLong)
    expect(zTaskName.safeParse('ก'.repeat(500)).success).toBe(true)
  })

  it('createTask: only projectId + name required; parentId defaults to null', () => {
    expect(createTaskSchema.parse({ projectId: P, name: ' x ' })).toEqual({
      projectId: P,
      parentId: null,
      name: 'x',
    })
    expect(createTaskSchema.safeParse({ projectId: P, name: 'x', afterId: null }).success).toBe(true)
    expect(createTaskSchema.safeParse({ projectId: 'nope', name: 'x' }).success).toBe(false)
  })

  it('patch: due before start → error at patch.dueDate; invalid dates and empty patches rejected', () => {
    const r = updateTaskSchema.safeParse({
      taskId: T,
      patch: { startDate: '2026-10-05', dueDate: '2026-10-01' },
    })
    expect(r.success).toBe(false)
    expect(firstError(r)).toMatchObject({
      message: th.tasks.errors.dueBeforeStart,
      path: ['patch', 'dueDate'],
    })
    expect(taskPatchSchema.safeParse({ dueDate: '2026-02-30' }).success).toBe(false)
    expect(taskPatchSchema.safeParse({}).success).toBe(false)
    expect(taskPatchSchema.parse({ startDate: '2026-10-01', dueDate: '2026-10-01' })).toEqual({
      startDate: '2026-10-01',
      dueDate: '2026-10-01',
    })
    expect(taskPatchSchema.parse({ notes: '   ' })).toEqual({ notes: null })
    expect(taskPatchSchema.parse({ certaintyOverride: null })).toEqual({ certaintyOverride: null })
  })

  it('ids are strict RFC uuids (Zod 4 z.uuid())', () => {
    expect(completeTaskSchema.safeParse({ taskIds: ['11111111-1111-1111-1111-111111111111'] }).success).toBe(
      false,
    )
    expect(completeTaskSchema.parse({ taskIds: [T] })).toEqual({ taskIds: [T], withChildren: false })
    expect(completeTaskSchema.safeParse({ taskIds: [] }).success).toBe(false)
  })

  it('restoreRemovedMember needs an ISO datetime with offset', () => {
    const base = { projectId: P, userId: 'u1', batch: null }
    expect(
      restoreRemovedMemberSchema.safeParse({
        ...base,
        member: { role: 'MEMBER', addedBy: null, addedAt: '2026-09-01T09:00:00+07:00' },
      }).success,
    ).toBe(true)
    expect(
      restoreRemovedMemberSchema.safeParse({
        ...base,
        member: { role: 'MEMBER', addedBy: null, addedAt: '2026-09-01' },
      }).success,
    ).toBe(false)
  })
})

describe('status / blocker / team-task schemas (SPEC v3.1)', () => {
  it('zStatusName trims and caps at 40; zStatusColor accepts only the palette (M3-D25/26)', () => {
    expect(zStatusName.parse('  รอลูกค้า  ')).toBe('รอลูกค้า')
    expect(firstError(zStatusName.safeParse('  '))?.message).toBe(th.tasks.status.errors.nameRequired)
    expect(firstError(zStatusName.safeParse('ก'.repeat(41)))?.message).toBe(
      th.tasks.status.errors.nameTooLong,
    )
    expect(zStatusColor.safeParse('#123456').success).toBe(false)
    expect(zStatusColor.parse('#B45309')).toBe('#B45309')
    expect(updateTaskStatusSchema.safeParse({ statusId: T, patch: {} }).success).toBe(false)
  })

  it('setTaskStatus defaults withChildren to false; revertTaskStatus takes exact dates', () => {
    expect(setTaskStatusSchema.parse({ taskIds: [T], statusId: P })).toEqual({
      taskIds: [T],
      statusId: P,
      withChildren: false,
    })
    expect(
      revertTaskStatusSchema.safeParse({ items: [{ taskId: T, statusId: P, completedOn: '2026-09-31' }] })
        .success,
    ).toBe(false)
    expect(revertTaskStatusSchema.safeParse({ items: [] }).success).toBe(false)
  })

  it('addTaskBlocker rejects a task blocking itself', () => {
    const r = addTaskBlockerSchema.safeParse({ taskId: T, blockerTaskId: T })
    expect(firstError(r)).toMatchObject({ message: th.tasks.blockers.errors.self, path: ['blockerTaskId'] })
    expect(addTaskBlockerSchema.safeParse({ taskId: T, blockerTaskId: P }).success).toBe(true)
  })

  it('teamTasksQuery parses string booleans (z.stringbool) and repeated categories (R27)', () => {
    expect(teamTasksQuerySchema.parse({})).toEqual({ blocked: false, includeDone: false })
    expect(teamTasksQuerySchema.parse({ blocked: '1', includeDone: 'true' })).toMatchObject({
      blocked: true,
      includeDone: true,
    })
    expect(teamTasksQuerySchema.parse({ blocked: '0' }).blocked).toBe(false)
    expect(teamTasksQuerySchema.safeParse({ projectId: 'x' }).success).toBe(false)
    const sp = new URLSearchParams('category=TODO&category=WAITING&blocked=1&projectId=' + P)
    expect(teamTasksQuerySchema.parse(teamTasksQueryFromSearchParams(sp))).toEqual({
      projectId: P,
      category: ['TODO', 'WAITING'],
      blocked: true,
      includeDone: false,
    })
    expect(
      teamTasksQuerySchema.safeParse(teamTasksQueryFromSearchParams(new URLSearchParams('category=NOPE')))
        .success,
    ).toBe(false)
  })

  it('teamTasksSearchParams round-trips through teamTasksQueryFromSearchParams', () => {
    const q = { projectId: P, category: ['TODO', 'DONE'] as const, blocked: '1', includeDone: 'false' }
    const sp = teamTasksSearchParams({ ...q, category: [...q.category] })
    expect(sp.toString()).toBe(`projectId=${P}&category=TODO&category=DONE&blocked=1`)
    expect(teamTasksQuerySchema.parse(teamTasksQueryFromSearchParams(sp))).toEqual({
      projectId: P,
      category: ['TODO', 'DONE'],
      blocked: true,
      includeDone: false,
    })
  })
})
