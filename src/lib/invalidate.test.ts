import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  invalidateCalendar,
  invalidateLeaveTypes,
  invalidateLoad,
  invalidateProjects,
  invalidateStatuses,
  invalidateTasks,
} from './invalidate'
import { qk } from './query-keys'
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
  it('invalidateLoad invalidates grid, workload, home, tasks.my and tasks.team only', async () => {
    const qc = seeded()
    await invalidateLoad(qc)
    for (const key of LOAD_KEYS) expect(invalidated(qc, key), JSON.stringify(key)).toBe(true)
    expect(invalidated(qc, qk.sidebar())).toBe(false)
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

  it('invalidateTasks invalidates projectTasks(id), myTasks, sidebar and teamTasksAll only', async () => {
    const qc = seeded()
    await invalidateTasks(qc, 'p1')
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
