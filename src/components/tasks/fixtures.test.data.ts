// Shared fixtures for the tasks UI tests (not imported by app code).
import type { TaskStatusCategory } from '@/domain/types'
import type { ProjectTasksResponse, TaskDTO, TaskStatusDTO } from '@/lib/contracts/tasks'
import { th } from '@/i18n/th'

export const PID = '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const S = {
  todo: uuid(901),
  doing: uuid(902),
  waitData: uuid(903),
  blocked: uuid(904),
  done: uuid(905),
}

const st = (id: string, name: string, category: TaskStatusCategory, position: string, color: string) => ({
  id,
  projectId: PID,
  name,
  category,
  position,
  color,
})

export const STATUSES: TaskStatusDTO[] = [
  st(S.todo, th.tasks.status.defaults.todo, 'TODO', 'a0', '#94A3B8'),
  st(S.doing, th.tasks.status.defaults.doing, 'IN_PROGRESS', 'a1', '#2F5597'),
  st(S.waitData, th.tasks.status.defaults.waitData, 'WAITING', 'a2', '#B45309'),
  st(S.blocked, th.tasks.status.defaults.blocked, 'WAITING', 'a3', '#B91C1C'),
  st(S.done, th.tasks.status.defaults.done, 'DONE', 'a4', '#15803D'),
]

export const T = { a: uuid(1), b: uuid(2), c: uuid(3), d: uuid(4), e: uuid(5) }

export function task(over: Partial<TaskDTO> & Pick<TaskDTO, 'id' | 'name' | 'position'>): TaskDTO {
  return {
    projectId: PID,
    parentId: null,
    depth: 0,
    hasBody: false,
    startDate: null,
    dueDate: null,
    certaintyOverride: null,
    completedOn: null,
    assignees: [],
    statusId: S.todo,
    blockers: { open: 0, total: 0 },
    milestoneId: null,
    lateForMilestone: false,
    ...over,
  }
}

/** A (root) ▸ B (child of A); C root, assigned to ivy; D root tentative. */
export function response(over: Partial<ProjectTasksResponse> = {}): ProjectTasksResponse {
  return {
    project: { id: PID, name: 'POS Upgrade', certainty: 'CONFIRMED', archived: false },
    viewer: { role: 'LEAD', canEdit: true, canManage: true },
    members: [
      { userId: 'cindy', role: 'LEAD' },
      { userId: 'ivy', role: 'MEMBER' },
    ],
    tasks: [
      task({ id: T.a, name: 'ออกแบบ', position: 'a0' }),
      task({ id: T.b, name: 'ย่อย B', position: 'a0', parentId: T.a, depth: 1 }),
      task({
        id: T.c,
        name: 'งาน C',
        position: 'a1',
        assignees: [{ assignmentId: uuid(501), userId: 'ivy' }],
      }),
      task({ id: T.d, name: 'งาน D', position: 'a2', certaintyOverride: 'TENTATIVE' }),
    ],
    statuses: STATUSES,
    blockerEdges: [],
    milestones: [],
    ...over,
  }
}

export const PEOPLE = {
  people: [
    { id: 'cindy', name: 'Cindy C.', nickname: 'Cindy', positionName: 'PM', color: null, active: true },
    { id: 'ivy', name: 'Ivy I.', nickname: 'Ivy', positionName: 'QA', color: null, active: true },
    { id: 'jack', name: 'Jack J.', nickname: 'Jack', positionName: 'Dev', color: null, active: true },
    { id: 'nok', name: 'Nok N.', nickname: 'Nok', positionName: 'Dev', color: null, active: false },
  ],
}
