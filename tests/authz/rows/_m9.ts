// tests/authz/rows/_m9.ts — shared helpers for the M9 rows files (workload.ts, people.ts), the masking block
// `workload & people (M9)` and the golden `M9 workload` suite (plan/m09 S5.1–S5.3, §7.2). No rows here.
// Expectations follow SPEC §3.2 ("ดู workload → ดูกฎ §3.3" = PERM-22, เปิดโปรเจค = PERM-06, ดูลูกค้า = PERM-04,
// วางแผน = PERM-12) and §3.3 (Manager and LEADs see everyone's totals; other workers see themselves + co-members),
// X40/X41 (invisible person / project / client → 404, bad query → 400 before authz), X86 (malformed id → 404).
// World createWorld({ with: ['allocations', 'milestones'] }) — visibility (X43): M, L → all users; Me → {member,
// lead, coworker, pOnly}; W → {outsider, coworker}.
import { GET as GET_CLIENT_LOAD } from '@/app/api/clients/[id]/load/route'
import { GET as GET_PERSON_GRID } from '@/app/api/grid/person/[userId]/route'
import { GET as GET_PEOPLE } from '@/app/api/people/route'
import { GET as GET_PERSON_TIME_OFF } from '@/app/api/people/[userId]/time-off/route'
import { GET as GET_PROJECT_LOAD } from '@/app/api/projects/[id]/load/route'
import { GET as GET_WORKLOAD } from '@/app/api/workload/route'
import { GET as GET_WORKLOAD_BADGE } from '@/app/api/workload/badge/route'
import { GET as GET_WORKLOAD_CELL } from '@/app/api/workload/cell/route'
import type { World, WorldPart } from '../../helpers/world'
import { callRoute } from '../_support/http'
import type { Outcome, Role } from '../types'
import { pinToday } from './_m5'

/** "Today" of every M9 row (X45): 2026-09-30 (Wed) → this week 2026-09-28. */
export const M9_TODAY = '2026-09-30'
export const M9_THIS_WEEK = '2026-09-28'

/** Every M9 row runs on the plan + milestone world (M6 coworker plans, M8 ◆ names for MASK-6). */
export const M9_WORLD = ['allocations', 'milestones'] as const satisfies readonly WorldPart[]

/** Every logged-in user (PERM-22 own view of §3.3; the content is filtered, never refused). */
export const ALL = { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' } as const satisfies Record<Role, Outcome>
/** Targets visible to M, L and Me but not W (member, pOnly; project P / A; client C1). */
export const NOT_W = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const satisfies Record<Role, Outcome>
/** The outsider as a target: M and L (LEAD → everyone) and the outsider herself; the member shares no project. */
export const NOT_ME = { M: 'allow', L: 'allow', Me: '404', W: 'allow' } as const satisfies Record<Role, Outcome>
/** Q / C2: the manager and Q's member (the outsider); lead and member are not in Q. */
export const Q_ONLY = { M: 'allow', L: '404', Me: '404', W: 'allow' } as const satisfies Record<Role, Outcome>
/** The same outcome for every role. */
export const each = (o: Outcome): Record<Role, Outcome> => ({ M: o, L: o, Me: o, W: o })

export const WORKLOAD_ROUTE = 'GET /api/workload'
export const WORKLOAD_CELL_ROUTE = 'GET /api/workload/cell'
export const WORKLOAD_BADGE_ROUTE = 'GET /api/workload/badge'
export const PERSON_GRID_ROUTE = 'GET /api/grid/person/[userId]'
export const PEOPLE_ROUTE = 'GET /api/people'
export const PERSON_TIME_OFF_ROUTE = 'GET /api/people/[userId]/time-off'
export const PROJECT_LOAD_ROUTE = 'GET /api/projects/[id]/load'
export const CLIENT_LOAD_ROUTE = 'GET /api/clients/[id]/load'
export const PERSON_HEADER_LOADER = 'services.people.getPersonHeader'

/** The 8 routes M9 adds (AZ-2 must find a row for each). */
export const M9_ROUTES = [
  WORKLOAD_ROUTE,
  WORKLOAD_CELL_ROUTE,
  WORKLOAD_BADGE_ROUTE,
  PERSON_GRID_ROUTE,
  PEOPLE_ROUTE,
  PERSON_TIME_OFF_ROUTE,
  PROJECT_LOAD_ROUTE,
  CLIENT_LOAD_ROUTE,
] as const

/** The person-grid chunk the rows read (aligned Mondays, `to` exclusive; 8 weeks). */
export const PERSON_GRID_RANGE = 'from=2026-09-28&to=2026-11-23'
/** The workload window the rows read (12 weeks). */
export const WORKLOAD_RANGE = 'from=2026-09-28&to=2026-12-21'

const withQs = (path: string, qs: string) => (qs ? `${path}?${qs}` : path)

/** `GET /api/workload?{qs}` as the current asUser() session, "today" pinned. */
export function workloadGet(qs = ''): Promise<Response> {
  pinToday()
  return callRoute(GET_WORKLOAD, withQs('/api/workload', qs))
}

/** `GET /api/workload/cell?userId&week`. */
export function workloadCellGet(userId: string, week: string): Promise<Response> {
  pinToday()
  return callRoute(GET_WORKLOAD_CELL, `/api/workload/cell?userId=${encodeURIComponent(userId)}&week=${week}`)
}

/** `GET /api/workload/badge`. */
export function workloadBadgeGet(): Promise<Response> {
  pinToday()
  return callRoute(GET_WORKLOAD_BADGE, '/api/workload/badge')
}

/** `GET /api/grid/person/{userId}?{qs}`. */
export function personGridGet(userId: string, qs = ''): Promise<Response> {
  pinToday()
  return callRoute(GET_PERSON_GRID, withQs(`/api/grid/person/${encodeURIComponent(userId)}`, qs), { userId })
}

/** `GET /api/people`. */
export function peopleGet(): Promise<Response> {
  pinToday()
  return callRoute(GET_PEOPLE, '/api/people')
}

/** `GET /api/people/{userId}/time-off`. */
export function personTimeOffGet(userId: string): Promise<Response> {
  pinToday()
  return callRoute(GET_PERSON_TIME_OFF, `/api/people/${encodeURIComponent(userId)}/time-off`, { userId })
}

/** `GET /api/projects/{id}/load`. */
export function projectLoadGet(id: string): Promise<Response> {
  pinToday()
  return callRoute(GET_PROJECT_LOAD, `/api/projects/${id}/load`, { id })
}

/** `GET /api/clients/{id}/load`. */
export function clientLoadGet(id: string): Promise<Response> {
  pinToday()
  return callRoute(GET_CLIENT_LOAD, `/api/clients/${id}/load`, { id })
}

/** 200 → body checks (content belongs to the masking suite; these pin the shape the row asked for). */
export async function check<T>(res: Response, fn: (body: T) => void): Promise<Response> {
  if (res.status === 200) fn((await res.clone().json()) as T)
  return res
}

/** Everything of P a Q-only viewer must never receive (names, ids, the coworker's P task / assignment, ◆). */
export function pNeedles(w: World): string[] {
  return [
    w.P.name,
    w.P.id,
    w.tasks.pCoworker.name,
    w.tasks.pCoworker.id,
    w.assignments.pCoworker.id,
    w.milestones.p.name,
    w.milestones.p.id,
  ]
}

/** Everything of Q that P's team must never receive. */
export function qNeedles(w: World): string[] {
  return [
    w.Q.name,
    w.Q.id,
    w.tasks.qTask.name,
    w.tasks.qTask.id,
    w.assignments.qTaskCoworker.id,
    w.assignments.qTaskOutsider.id,
    w.statuses.Q.waitData.name,
  ]
}
