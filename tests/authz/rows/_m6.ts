// tests/authz/rows/_m6.ts — shared helpers for the M6 rows file (allocations.ts) and the grid masking block
// (masking.int.test.ts › grid (M6)); plan/m06 S5.1–S5.2, §7.2. No rows here. Expectations follow SPEC §3.2
// (PERM-06 เปิดโปรเจค, PERM-12 วางแผน: M/L/Me allow, W 404) and X41/X42 (invisible → 404, archived write → 403,
// bad input → 400 with parse before authz).
import { GET as GET_GRID } from '@/app/api/grid/project/[projectId]/route'
import type { ISODate } from '@/domain/types'
import type { PlanAssignmentRangeOk, SaveAllocationsOk } from '@/lib/contracts/grid'
import type { ActionResult } from '@/lib/action-result'
import { planAssignmentRange, saveAllocations } from '@/server/actions/allocations'
import { ALLOCATION_AUDIT_ENTITY } from '@/server/services/allocations'
import type { World, WorldPart } from '../../helpers/world'
import { callRoute } from '../_support/http'
import type { Outcome, Role } from '../types'
import { pinToday } from './_m5'

/** PERM-06 / PERM-12 on P (or A for reads): the team may; the outsider never sees the project (404). */
export const PROJ = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const satisfies Record<Role, Outcome>
/** X42: every plan write on archived A is 403 for everyone who can see it. */
export const ARCH_WRITE = { M: '403', L: '403', Me: '403', W: '404' } as const satisfies Record<Role, Outcome>
/** A visible row whose input the service rejects (DAY_WEEK, UNREPRESENTABLE): 400 for the team, 404 for W. */
export const PROJ_400 = { M: '400', L: '400', Me: '400', W: '404' } as const satisfies Record<Role, Outcome>
/** A stale baseVersion on a visible assignment: 409 for the team, 404 for W (authz precedes the version check). */
export const PROJ_409 = { M: '409', L: '409', Me: '409', W: '404' } as const satisfies Record<Role, Outcome>
/** The same outcome for every role. */
export const each = (o: Outcome): Record<Role, Outcome> => ({ M: o, L: o, Me: o, W: o })

/** Every M6 row runs on the plan world (implies tasks + timeOff; plan/m06 S0.11). */
export const ALLOC = ['allocations'] as const satisfies readonly WorldPart[]

/** X44 / M6-D29: one `allocation` audit row per changed assignment, project_id = the assignment's project. */
export const auditAllocationP = { entity: ALLOCATION_AUDIT_ENTITY, projectId: (w: World) => w.P.id } as const

/** The 8-week chunk the matrix reads (aligned Mondays, `to` exclusive). */
export const GRID_RANGE = 'from=2026-09-28&to=2026-11-23'

/** `GET /api/grid/project/{projectId}?{qs}` as the current asUser() session, with "today" pinned (X45). */
export function gridGet(projectId: string, qs = ''): Promise<Response> {
  pinToday()
  return callRoute(GET_GRID, `/api/grid/project/${projectId}${qs ? `?${qs}` : ''}`, { projectId })
}

/** `saveAllocations` with "today" pinned (the action passes serverToday() to the service, X90). */
export function save(input: Parameters<typeof saveAllocations>[0]): Promise<ActionResult<SaveAllocationsOk>> {
  pinToday()
  return saveAllocations(input)
}

/** `planAssignmentRange` with "today" pinned. */
export function planRange(
  input: Parameters<typeof planAssignmentRange>[0],
): Promise<ActionResult<PlanAssignmentRangeOk>> {
  pinToday()
  return planAssignmentRange(input)
}

/** One WEEK change for one assignment (the common matrix input). */
export function weekItem(
  taskAssignmentId: string,
  period: ISODate,
  cd: number | null,
  baseVersion = 1,
): Parameters<typeof saveAllocations>[0]['items'][number] {
  return { taskAssignmentId, baseVersion, changes: [{ granularity: 'WEEK', period, cd }] }
}
