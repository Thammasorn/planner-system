import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  invalidateCalendar,
  invalidateLeaveTypes,
  invalidateLoad,
  invalidateMilestones,
  invalidatePlanMarkers,
  invalidateProjects,
  invalidateStatuses,
  invalidateTaskBody,
  invalidateTasks,
  invalidateTaskViews,
  patchTaskHasBody,
} from './invalidate'
import type { ProjectTasksResponse, TaskDTO } from './contracts/tasks'
import { type GridChunk, qk } from './query-keys'
import { teamTasksQuerySchema } from './schemas/tasks'

const LOAD_KEYS = [
  ['grid', 'project', 'x', {}],
  ['workload', 'table', {}],
  ['home'],
  ['tasks', 'my'],
  ['tasks', 'team'],
] as const

const TEAM_FILTER = teamTasksQuerySchema.parse({})
const TASK_KEYS = [qk.projectTasks('p1'), qk.myTasks(), qk.sidebar(), qk.teamTasksAll()] as const

function seeded(): QueryClient {
  const qc = new QueryClient()
  for (const key of [
    ...LOAD_KEYS,
    qk.sidebar(),
    qk.peopleOptions(),
    qk.clientOptions(null),
    qk.clientOptions('p1'),
    qk.projectTasks('p1'),
    qk.projectTasks('p2'),
    qk.projectStatuses('p1'),
    qk.projectStatuses('p2'),
    qk.teamTasks(TEAM_FILTER),
  ])
    qc.setQueryData(key, 1)
  return qc
}

const invalidated = (qc: QueryClient, key: readonly unknown[]) => qc.getQueryState(key)?.isInvalidated

describe('invalidate (X18)', () => {
  it('invalidateLoad invalidates grid, workload, home, tasks.my, tasks.team and (M9-D17) the sidebar only', async () => {
    const qc = seeded()
    await invalidateLoad(qc)
    for (const key of LOAD_KEYS) expect(invalidated(qc, key), JSON.stringify(key)).toBe(true)
    expect(invalidated(qc, qk.sidebar())).toBe(true)
    expect(invalidated(qc, qk.peopleOptions())).toBe(false)
    expect(invalidated(qc, qk.clientOptions(null))).toBe(false)
    expect(invalidated(qc, qk.projectTasks('p1'))).toBe(false)
    expect(invalidated(qc, qk.projectStatuses('p1'))).toBe(false)
  })

  it('invalidateProjects invalidates the sidebar and every client-options query only', async () => {
    const qc = seeded()
    await invalidateProjects(qc)
    expect(invalidated(qc, qk.sidebar())).toBe(true)
    expect(invalidated(qc, qk.clientOptions(null))).toBe(true)
    expect(invalidated(qc, qk.clientOptions('p1'))).toBe(true)
    expect(invalidated(qc, qk.peopleOptions())).toBe(false)
    expect(invalidated(qc, ['home'])).toBe(false)
  })

  it('invalidateTasks invalidates projectTasks(id), myTasks, sidebar, teamTasksAll and the project’s grid only', async () => {
    const qc = seeded()
    const chunk: GridChunk = { from: '2026-08-31', includeOthers: false, expand: [], zoom: 'WEEK' }
    qc.setQueryData(qk.gridChunk({ kind: 'project', id: 'p1' }, chunk), {})
    qc.setQueryData(qk.gridChunk({ kind: 'project', id: 'p2' }, chunk), {})
    await invalidateTasks(qc, 'p1')
    expect(invalidated(qc, qk.gridChunk({ kind: 'project', id: 'p1' }, chunk))).toBe(true)
    expect(invalidated(qc, qk.gridChunk({ kind: 'project', id: 'p2' }, chunk))).toBe(false)
    for (const key of TASK_KEYS) expect(invalidated(qc, key), JSON.stringify(key)).toBe(true)
    expect(invalidated(qc, qk.teamTasks(TEAM_FILTER))).toBe(true)
    expect(invalidated(qc, qk.projectTasks('p2'))).toBe(false)
    expect(invalidated(qc, qk.projectStatuses('p1'))).toBe(false)
    expect(invalidated(qc, qk.peopleOptions())).toBe(false)
    expect(invalidated(qc, qk.clientOptions(null))).toBe(false)
    expect(invalidated(qc, ['home'])).toBe(false)
    expect(invalidated(qc, ['grid', 'project', 'x', {}])).toBe(false)
  })

  it('invalidateStatuses also invalidates projectStatuses(id)', async () => {
    const qc = seeded()
    await invalidateStatuses(qc, 'p1')
    for (const key of TASK_KEYS) expect(invalidated(qc, key), JSON.stringify(key)).toBe(true)
    expect(invalidated(qc, qk.projectStatuses('p1'))).toBe(true)
    expect(invalidated(qc, qk.projectStatuses('p2'))).toBe(false)
    expect(invalidated(qc, qk.projectTasks('p2'))).toBe(false)
    expect(invalidated(qc, ['home'])).toBe(false)
  })

  it('invalidateCalendar (M5) invalidates every calendar range only', async () => {
    const qc = seeded()
    qc.setQueryData(qk.calendar('2026-08-31', '2026-10-12'), 1)
    qc.setQueryData(qk.calendar('2026-09-28', '2026-11-09'), 1)
    qc.setQueryData(qk.leaveTypes(), 1)
    await invalidateCalendar(qc)
    expect(invalidated(qc, ['calendar', '2026-08-31', '2026-10-12'])).toBe(true)
    expect(invalidated(qc, qk.calendar('2026-09-28', '2026-11-09'))).toBe(true)
    expect(invalidated(qc, ['sidebar'])).toBe(false)
    expect(invalidated(qc, qk.leaveTypes())).toBe(false)
    expect(invalidated(qc, ['home'])).toBe(false)
  })

  it('invalidateLeaveTypes (M5) invalidates the leave-type options and the calendar', async () => {
    const qc = seeded()
    qc.setQueryData(qk.calendar('2026-08-31', '2026-10-12'), 1)
    qc.setQueryData(qk.leaveTypes(), 1)
    await invalidateLeaveTypes(qc)
    expect(invalidated(qc, ['leaveTypes'])).toBe(true)
    expect(invalidated(qc, qk.calendar('2026-08-31', '2026-10-12'))).toBe(true)
    expect(invalidated(qc, qk.sidebar())).toBe(false)
  })
})

describe('grid keys (M6, X18, X82)', () => {
  const ctx = { kind: 'project', id: 'p' } as const
  const chunk: GridChunk = { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: false }

  it('qk.gridAll is the prefix of qk.gridChunk', () => {
    expect(qk.gridAll(ctx)).toEqual(['grid', 'project', 'p'])
    expect(qk.gridChunk(ctx, chunk)).toEqual(['grid', 'project', 'p', chunk])
    expect(qk.gridChunk({ kind: 'person', id: 'u' }, chunk).slice(0, 3)).toEqual(
      qk.gridAll({ kind: 'person', id: 'u' }),
    )
  })

  it('invalidateLoad invalidates every grid chunk but not the project tasks', async () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.gridChunk(ctx, chunk), 1)
    qc.setQueryData(qk.gridChunk(ctx, { ...chunk, from: '2026-11-23', includeOthers: true }), 1)
    qc.setQueryData(qk.projectTasks('p'), 1)
    await invalidateLoad(qc)
    expect(invalidated(qc, qk.gridChunk(ctx, chunk))).toBe(true)
    expect(invalidated(qc, qk.gridChunk(ctx, { ...chunk, from: '2026-11-23', includeOthers: true }))).toBe(
      true,
    )
    expect(invalidated(qc, qk.projectTasks('p'))).toBe(false)
  })
})

describe('task bodies (M6.1 S0.8)', () => {
  const task = (id: string, hasBody: boolean): TaskDTO => ({
    id,
    projectId: 'p1',
    parentId: null,
    depth: 0,
    position: 'a0',
    name: id,
    startDate: null,
    dueDate: null,
    certaintyOverride: null,
    completedOn: null,
    assignees: [],
    statusId: 's',
    blockers: { open: 0, total: 0 },
    hasBody,
    milestoneId: null,
    lateForMilestone: false,
  })
  const list = (): ProjectTasksResponse => ({
    project: { id: 'p1', name: 'P', certainty: 'CONFIRMED', archived: false },
    viewer: { role: 'MEMBER', canEdit: true, canManage: false },
    members: [],
    tasks: [task('a', false), task('b', true)],
    statuses: [],
    blockerEdges: [],
    milestones: [],
  })

  it('qk.taskBody is ["tasks", "body", id] and task writes do not invalidate it', async () => {
    expect(qk.taskBody('t1')).toEqual(['tasks', 'body', 't1'])
    const qc = seeded()
    qc.setQueryData(qk.taskBody('t1'), 1)
    await invalidateTasks(qc, 'p1')
    expect(invalidated(qc, qk.taskBody('t1'))).toBe(false)
    await invalidateTaskBody(qc, 't1')
    expect(invalidated(qc, qk.taskBody('t1'))).toBe(true)
  })

  it('patchTaskHasBody patches one task; unchanged / missing → same reference; no cache → nothing created', () => {
    const qc = new QueryClient()
    patchTaskHasBody(qc, 'p1', 'a', true)
    expect(qc.getQueryData(qk.projectTasks('p1'))).toBeUndefined()
    qc.setQueryData(qk.projectTasks('p1'), list())
    const before = qc.getQueryData<ProjectTasksResponse>(qk.projectTasks('p1'))!
    patchTaskHasBody(qc, 'p1', 'b', true)
    patchTaskHasBody(qc, 'p1', 'zz', true)
    expect(qc.getQueryData(qk.projectTasks('p1'))).toBe(before)
    patchTaskHasBody(qc, 'p1', 'a', true)
    const after = qc.getQueryData<ProjectTasksResponse>(qk.projectTasks('p1'))!
    expect(after.tasks.map((t) => [t.id, t.hasBody])).toEqual([
      ['a', true],
      ['b', true],
    ])
    expect(after.tasks[1]).toBe(before.tasks[1])
  })

  it('invalidateTaskViews invalidates the project list, /my and every /tasks page only', async () => {
    const qc = seeded()
    await invalidateTaskViews(qc, 'p1')
    expect(invalidated(qc, qk.projectTasks('p1'))).toBe(true)
    expect(invalidated(qc, qk.myTasks())).toBe(true)
    expect(invalidated(qc, qk.teamTasks(TEAM_FILTER))).toBe(true)
    expect(invalidated(qc, qk.projectTasks('p2'))).toBe(false)
    expect(invalidated(qc, qk.sidebar())).toBe(false)
    expect(invalidated(qc, ['grid', 'project', 'x', {}])).toBe(false)
  })
})

describe('plan markers (M7.1 S0.5, X82)', () => {
  it('qk.planMarkers is ["planMarkers", projectId]; invalidatePlanMarkers touches that project only', async () => {
    expect(qk.planMarkers('p1')).toEqual(['planMarkers', 'p1'])
    const qc = seeded()
    qc.setQueryData(qk.planMarkers('p1'), 1)
    qc.setQueryData(qk.planMarkers('p2'), 1)
    await invalidatePlanMarkers(qc, 'p1')
    expect(invalidated(qc, qk.planMarkers('p1'))).toBe(true)
    expect(invalidated(qc, qk.planMarkers('p2'))).toBe(false)
    expect(invalidated(qc, qk.projectTasks('p1'))).toBe(false)
    expect(invalidated(qc, ['grid', 'project', 'x', {}])).toBe(false)
  })

  it('task and load invalidations leave the markers alone', async () => {
    const qc = seeded()
    qc.setQueryData(qk.planMarkers('p1'), 1)
    await invalidateTasks(qc, 'p1')
    await invalidateLoad(qc)
    expect(invalidated(qc, qk.planMarkers('p1'))).toBe(false)
  })
})

describe('milestones (M8 S0.6, M8-D22)', () => {
  const chunk: GridChunk = { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: false }

  it('qk.projectMilestones / qk.milestoneTargets keys', () => {
    expect(qk.projectMilestones('p')).toEqual(['projects', 'p', 'milestones'])
    expect(qk.milestoneTargets()).toEqual(['milestones', 'targets'])
  })

  it('invalidateMilestones: the project milestones, project + person grids, project tasks, /tasks and the calendar only', async () => {
    const qc = new QueryClient()
    const keys = {
      milestonesP: qk.projectMilestones('p'),
      milestonesQ: qk.projectMilestones('q'),
      gridP: qk.gridChunk({ kind: 'project', id: 'p' }, chunk),
      gridQ: qk.gridChunk({ kind: 'project', id: 'q' }, chunk),
      gridPerson: qk.gridChunk({ kind: 'person', id: 'u1' }, chunk),
      calendar: qk.calendar('2026-09-28', '2026-11-09'),
      tasksP: qk.projectTasks('p'),
      tasksQ: qk.projectTasks('q'),
      team: qk.teamTasks(TEAM_FILTER),
      targets: qk.milestoneTargets(),
      statusesP: qk.projectStatuses('p'),
      sidebar: qk.sidebar(),
    }
    for (const key of Object.values(keys)) qc.setQueryData(key, 1)
    await invalidateMilestones(qc, 'p')
    for (const k of ['milestonesP', 'gridP', 'gridPerson', 'calendar', 'tasksP', 'team'] as const)
      expect(invalidated(qc, keys[k]), k).toBe(true)
    for (const k of ['milestonesQ', 'gridQ', 'tasksQ', 'targets', 'statusesP', 'sidebar'] as const)
      expect(invalidated(qc, keys[k]), k).toBe(false)
  })

  it('invalidateTasks(qc, p) also invalidates qk.projectMilestones(p) (progress), not q', async () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.projectMilestones('p'), 1)
    qc.setQueryData(qk.projectMilestones('q'), 1)
    await invalidateTasks(qc, 'p')
    expect(invalidated(qc, qk.projectMilestones('p'))).toBe(true)
    expect(invalidated(qc, qk.projectMilestones('q'))).toBe(false)
  })
})

describe('workload / people keys (M9 S0.7, M9-D17/D22, X82)', () => {
  const chunk: GridChunk = { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: false }
  const params = { from: '2026-09-28', to: '2026-12-21', positionId: null, projectId: null, onlyOver: false }

  it('keys live under the workload / calendar prefixes', () => {
    expect(qk.workload(params)).toEqual(['workload', 'table', params])
    expect(qk.workloadCell('u', '2026-10-05')).toEqual(['workload', 'cell', 'u', '2026-10-05'])
    expect(qk.workloadBadge()).toEqual(['workload', 'badge'])
    expect(qk.peopleDirectory()).toEqual(['workload', 'people'])
    expect(qk.projectLoad('p')).toEqual(['workload', 'project', 'p'])
    expect(qk.clientLoad('c')).toEqual(['workload', 'client', 'c'])
    expect(qk.personTimeOff('u')).toEqual(['calendar', 'person', 'u'])
  })

  it('invalidateLoad reaches every workload view, person grids and the sidebar, but not the person leave tab', async () => {
    const qc = new QueryClient()
    const keys = {
      table: qk.workload(params),
      cell: qk.workloadCell('u', '2026-10-05'),
      badge: qk.workloadBadge(),
      project: qk.projectLoad('p'),
      client: qk.clientLoad('c'),
      people: qk.peopleDirectory(),
      personGrid: qk.gridChunk({ kind: 'person', id: 'u' }, chunk),
      sidebar: qk.sidebar(),
      personTimeOff: qk.personTimeOff('u'),
    }
    for (const key of Object.values(keys)) qc.setQueryData(key, 1)
    await invalidateLoad(qc)
    for (const k of [
      'table',
      'cell',
      'badge',
      'project',
      'client',
      'people',
      'personGrid',
      'sidebar',
    ] as const)
      expect(invalidated(qc, keys[k]), k).toBe(true)
    expect(invalidated(qc, keys.personTimeOff)).toBe(false)
  })

  it('invalidateCalendar reaches the person leave tab', async () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.personTimeOff('u'), 1)
    qc.setQueryData(qk.workloadBadge(), 1)
    await invalidateCalendar(qc)
    expect(invalidated(qc, qk.personTimeOff('u'))).toBe(true)
    expect(invalidated(qc, qk.workloadBadge())).toBe(false)
  })
})
