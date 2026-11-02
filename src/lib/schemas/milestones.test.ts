import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { preferenceInput } from './preferences'
import {
  createMilestoneSchema,
  deleteMilestoneSchema,
  linkTasksToMilestoneSchema,
  milestonePatchSchema,
  restoreMilestoneBatchSchema,
  revertTaskMilestonesSchema,
  updateMilestoneSchema,
} from './milestones'
import { teamTasksQuerySchema } from './tasks'

const P = '0b9f0c6e-6a43-4c8e-9d43-2f6f7c1b2a10'
const M = '6f1e2d3c-4b5a-4f60-8e71-a2b3c4d5e6f7'
const T = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** First issue of a failed parse: { message, path }. */
function issue(r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) {
  expect(r.success).toBe(false)
  const i = r.error!.issues[0]!
  return { message: i.message, path: i.path.join('.') }
}

describe('milestone schemas (FR-701, M8-D3/D19)', () => {
  const base = { projectId: P, name: 'UAT sign-off', date: '2026-10-23' }

  it('create: name is trimmed; description omitted stays undefined', () => {
    const v = createMilestoneSchema.parse({ ...base, name: '  UAT sign-off  ' })
    expect(v.name).toBe('UAT sign-off')
    expect(v.description).toBeUndefined()
  })

  it("create: '' and whitespace → nameRequired at name; 201 chars → nameTooLong; 200 ok", () => {
    for (const name of ['', '   '])
      expect(issue(createMilestoneSchema.safeParse({ ...base, name }))).toEqual({
        message: th.milestones.errors.nameRequired,
        path: 'name',
      })
    expect(issue(createMilestoneSchema.safeParse({ ...base, name: 'ก'.repeat(201) }))).toEqual({
      message: th.milestones.errors.nameTooLong,
      path: 'name',
    })
    expect(createMilestoneSchema.safeParse({ ...base, name: 'ก'.repeat(200) }).success).toBe(true)
  })

  it("create: date '2026-02-30' / 'x' / missing → dateRequired", () => {
    for (const date of ['2026-02-30', 'x', undefined])
      expect(issue(createMilestoneSchema.safeParse({ ...base, date }))).toEqual({
        message: th.milestones.errors.dateRequired,
        path: 'date',
      })
  })

  it("create: description '   ' → null, 2 000 chars ok, 2 001 → descriptionTooLong; null ok", () => {
    expect(createMilestoneSchema.parse({ ...base, description: '   ' }).description).toBeNull()
    expect(createMilestoneSchema.parse({ ...base, description: null }).description).toBeNull()
    expect(createMilestoneSchema.parse({ ...base, description: 'ก'.repeat(2000) }).description).toHaveLength(2000)
    expect(issue(createMilestoneSchema.safeParse({ ...base, description: 'ก'.repeat(2001) }))).toEqual({
      message: th.milestones.errors.descriptionTooLong,
      path: 'description',
    })
  })

  it('create: projectId must be a uuid', () => {
    expect(createMilestoneSchema.safeParse({ ...base, projectId: 'abc' }).success).toBe(false)
  })

  it('patch: {} → emptyPatch; completed / completedOn alone ok; both → completedConflict at completedOn', () => {
    expect(issue(milestonePatchSchema.safeParse({})).message).toBe(th.milestones.errors.emptyPatch)
    expect(milestonePatchSchema.parse({ completed: true })).toEqual({ completed: true })
    expect(milestonePatchSchema.parse({ completedOn: '2026-09-16' })).toEqual({ completedOn: '2026-09-16' })
    expect(milestonePatchSchema.parse({ completedOn: null })).toEqual({ completedOn: null })
    expect(issue(milestonePatchSchema.safeParse({ completed: true, completedOn: '2026-09-16' }))).toEqual({
      message: th.milestones.errors.completedConflict,
      path: 'completedOn',
    })
    expect(milestonePatchSchema.parse({ name: '  ใหม่ ', date: '2026-10-30' })).toEqual({
      name: 'ใหม่',
      date: '2026-10-30',
    })
  })

  it('update / delete / restore take uuids', () => {
    expect(updateMilestoneSchema.safeParse({ milestoneId: M, patch: { date: '2026-10-30' } }).success).toBe(true)
    expect(updateMilestoneSchema.safeParse({ milestoneId: 'x', patch: { date: '2026-10-30' } }).success).toBe(false)
    expect(issue(updateMilestoneSchema.safeParse({ milestoneId: M, patch: {} })).path).toBe('patch')
    expect(deleteMilestoneSchema.safeParse({ milestoneId: M }).success).toBe(true)
    expect(deleteMilestoneSchema.safeParse({ milestoneId: 'x' }).success).toBe(false)
    expect(restoreMilestoneBatchSchema.safeParse({ batch: M }).success).toBe(true)
    expect(restoreMilestoneBatchSchema.safeParse({ batch: 'x' }).success).toBe(false)
  })

  it('link: milestoneId null ok; taskIds [] / 501 ids / bad uuid → error; 500 ok', () => {
    expect(linkTasksToMilestoneSchema.safeParse({ taskIds: [T(1)], milestoneId: null }).success).toBe(true)
    expect(linkTasksToMilestoneSchema.safeParse({ taskIds: [T(1)], milestoneId: M }).success).toBe(true)
    expect(linkTasksToMilestoneSchema.safeParse({ taskIds: [], milestoneId: M }).success).toBe(false)
    const ids = (n: number) => Array.from({ length: n }, (_, i) => T(i + 1))
    expect(linkTasksToMilestoneSchema.safeParse({ taskIds: ids(500), milestoneId: M }).success).toBe(true)
    expect(linkTasksToMilestoneSchema.safeParse({ taskIds: ids(501), milestoneId: M }).success).toBe(false)
    expect(linkTasksToMilestoneSchema.safeParse({ taskIds: ['x'], milestoneId: M }).success).toBe(false)
  })

  it('revert: a repeated taskId → duplicateTask at items; distinct ok; [] → error', () => {
    expect(
      issue(
        revertTaskMilestonesSchema.safeParse({
          items: [
            { taskId: T(1), milestoneId: M },
            { taskId: T(1), milestoneId: null },
          ],
        }),
      ),
    ).toEqual({ message: th.milestones.errors.duplicateTask, path: 'items' })
    expect(
      revertTaskMilestonesSchema.safeParse({
        items: [
          { taskId: T(1), milestoneId: M },
          { taskId: T(2), milestoneId: null },
        ],
      }).success,
    ).toBe(true)
    expect(revertTaskMilestonesSchema.safeParse({ items: [] }).success).toBe(false)
  })
})

describe('M8 extensions of M1/M3 schemas', () => {
  it('teamTasksQuerySchema parses milestoneId=<uuid> and rejects milestoneId=abc', () => {
    expect(teamTasksQuerySchema.parse({ milestoneId: M }).milestoneId).toBe(M)
    expect(teamTasksQuerySchema.safeParse({ milestoneId: 'abc' }).success).toBe(false)
  })

  it("preference { key: 'tasks.groupBy', value: 'milestone' } parses", () => {
    expect(preferenceInput.safeParse({ key: 'tasks.groupBy', value: 'milestone' }).success).toBe(true)
  })
})
