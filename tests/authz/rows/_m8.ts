// tests/authz/rows/_m8.ts — shared helpers for the M8 rows file (milestones.ts) and the masking block
// `milestones (M8)` (plan/m08 S5.1–S5.2, §7.2). No rows here. Expectations follow SPEC §3.2 (row "สร้าง/แก้/ลบ
// milestone" = PERM-15: M ✅ · L ✅ · Me ดูได้ · W —; reads = PERM-06 เห็นโปรเจค; binding a task = PERM-11 task edit,
// M8-D4) and X41/X42 (invisible → 404, Me on PERM-15 → 403, archived writes → 403, bad input → 400 before authz).
// World createWorld({ with: ['milestones'] }) (plan/m08 S0.10, M8-D23): P · p 'Milestone P-ลับ06' 10-23 (pChildB) ·
// pLate 'ส่งมอบรอบแรก P' 10-02 (pLeaf, late) · pDone 'Kickoff P' 09-15 done (pDone); Q · q 'Milestone Q-ลับ05' 10-20
// (qTask); A (archived) · a 'Milestone A' 10-30 (aTask); soft-deleted pDeleted (pParent still points at it), pExpired
// (31 days), aDeleted.
import { GET as GET_PROJECT_MILESTONES } from '@/app/api/projects/[id]/milestones/route'
import { GET as GET_TARGETS } from '@/app/api/milestones/targets/route'
import { GET as GET_TEAM_TASKS } from '@/app/api/tasks/route'
import {
  createMilestone,
  deleteMilestone,
  linkTasksToMilestone,
  restoreMilestoneBatch,
  revertTaskMilestones,
  updateMilestone,
} from '@/server/actions/milestones'
import { MILESTONE_AUDIT_ENTITY } from '@/server/services/milestones'
import type { World, WorldPart } from '../../helpers/world'
import { callRoute } from '../_support/http'
import type { Outcome, Role } from '../types'
import { pinToday } from './_m5'

/** "Today" every M8 row and masking case runs on (X45): 2026-09-30 (Wed). */
export const M8_TODAY = '2026-09-30'

/** PERM-06 reads and PERM-11 bindings on a visible, active project: the team may; W never sees P (404). */
export const VIEW = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const satisfies Record<Role, Outcome>
/** PERM-15 (สร้าง/แก้/ลบ milestone): M and LEAD; MEMBER "ดูได้" → 403; W 404. */
export const MANAGE = { M: 'allow', L: 'allow', Me: '403', W: '404' } as const satisfies Record<Role, Outcome>
/** X42: every write on archived A (milestone or binding) is 403 for whoever can see it. */
export const ARCH = { M: '403', L: '403', Me: '403', W: '404' } as const satisfies Record<Role, Outcome>
/** Nobody can address it (unknown / deleted id). */
export const ALL404 = { M: '404', L: '404', Me: '404', W: '404' } as const satisfies Record<Role, Outcome>
/** zod parse precedes authz (X41). */
export const BAD = { M: '400', L: '400', Me: '400', W: '400' } as const satisfies Record<Role, Outcome>
/** Every logged-in user (own data). */
export const ALL = { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' } as const satisfies Record<Role, Outcome>

/** Every M8 row runs on the milestones world (implies tasks + allocations). */
export const MILESTONE_WORLD = ['milestones'] as const satisfies readonly WorldPart[]

export const PROJECT_MILESTONES_ROUTE = 'GET /api/projects/[id]/milestones'
export const TARGETS_ROUTE = 'GET /api/milestones/targets'
export const TEAM_TASKS_ROUTE = 'GET /api/tasks'

/** X44 / M8-D21: one `milestone` audit row with the milestone's project. */
export const auditMilestone = (pick: (w: World) => string) =>
  ({ entity: MILESTONE_AUDIT_ENTITY, projectId: (w: World) => pick(w) }) as const
/** X44 / M8-D21: a binding writes one `task` row per changed task (entity 'task', action 'update'). */
export const auditTask = (pick: (w: World) => string) => ({ entity: 'task', projectId: (w: World) => pick(w) }) as const

/** `GET /api/projects/{id}/milestones` as the current asUser() session, "today" pinned. */
export function milestonesGet(projectId: string): Promise<Response> {
  pinToday()
  return callRoute(GET_PROJECT_MILESTONES, `/api/projects/${projectId}/milestones`, { id: projectId })
}

/** `GET /api/milestones/targets` as the current asUser() session. */
export function targetsGet(): Promise<Response> {
  pinToday()
  return callRoute(GET_TARGETS, '/api/milestones/targets')
}

/** `GET /api/tasks?{qs}` (M3 team tasks; M8 adds `milestoneId`) as the current asUser() session. */
export function teamTasksGet(qs = ''): Promise<Response> {
  pinToday()
  return callRoute(GET_TEAM_TASKS, `/api/tasks${qs ? `?${qs}` : ''}`)
}

/** The six M8 actions with "today" pinned (the actions pass serverToday() to the services, X90). */
export const ms = {
  create: (i: Parameters<typeof createMilestone>[0]) => {
    pinToday()
    return createMilestone(i)
  },
  update: (i: Parameters<typeof updateMilestone>[0]) => {
    pinToday()
    return updateMilestone(i)
  },
  remove: (i: Parameters<typeof deleteMilestone>[0]) => {
    pinToday()
    return deleteMilestone(i)
  },
  restore: (i: Parameters<typeof restoreMilestoneBatch>[0]) => {
    pinToday()
    return restoreMilestoneBatch(i)
  },
  link: (i: Parameters<typeof linkTasksToMilestone>[0]) => {
    pinToday()
    return linkTasksToMilestone(i)
  },
  revert: (i: Parameters<typeof revertTaskMilestones>[0]) => {
    pinToday()
    return revertTaskMilestones(i)
  },
}

/** Every name / id of the world's P and A milestones (live and deleted) — what Q-only viewers must never receive. */
export function pAndAMilestoneSecrets(w: World): string[] {
  const m = w.milestones
  const d = w.deletedMilestones
  return [m.p, m.pLate, m.pDone, m.a, d.pDeleted, d.pExpired, d.aDeleted].flatMap((x) => [x.name, x.id])
}

/** Q's milestone name / id — what P's team must never receive. */
export function qMilestoneSecrets(w: World): string[] {
  return [w.milestones.q.name, w.milestones.q.id]
}
