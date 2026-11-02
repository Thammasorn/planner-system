// tests/authz/rows/_m7_1.ts — shared helpers for the M7.1 rows file (plan-markers.ts) and the masking block
// `M7.1 chart` (plan/m07.1 S5.1–S5.2, §7.2). No rows here. Expectations follow SPEC §3.2 (PERM-06 เห็นโปรเจค for the
// reads; PERM-29 เพิ่ม/แก้/ลบ/กู้คืน เส้นกำกับบนแผนงาน = สิทธิ์วางแผน: M/L/Me allow, archived 403, W 404) and X41/X42/X86
// (invisible → 404, archived write → 403, bad input → 400 with parse before authz, malformed [id] → 404).
// World createWorld({ with: ['planMarkers'] }) (plan/m07.1 S0.11): P · pRed RED 2026-10-23 'UAT sign-off', pGreen GREEN
// 2026-11-06 no label; A (archived) · aYellow; Q (lead and member are not members) · qRed.
import { randomUUID } from 'node:crypto'
import { GET as GET_MARKERS } from '@/app/api/projects/[id]/plan-markers/route'
import type { ISODate } from '@/domain/types'
import { addDays } from '@/domain/dates'
import type { PlanMarkerColor } from '@/lib/contracts/plan-markers'
import { PLAN_MARKER_LIMIT } from '@/lib/schemas/plan-markers'
import { makePlanMarker } from '../../helpers/factories'
import type { WorldPart } from '../../helpers/world'
import { callRoute } from '../_support/http'
import type { Outcome, Role } from '../types'

/** PERM-06 reads / PERM-29 writes on a visible, active project. */
export const VIEW = { M: 'allow', L: 'allow', Me: 'allow', W: '404' } as const satisfies Record<Role, Outcome>
/** X42: marker writes on archived A. */
export const ARCH = { M: '403', L: '403', Me: '403', W: '404' } as const satisfies Record<Role, Outcome>
/** zod parse precedes authz (X41). */
export const BAD = { M: '400', L: '400', Me: '400', W: '400' } as const satisfies Record<Role, Outcome>
/** Business validation (the 100-marker limit) runs after authz. */
export const VIEW_400 = { M: '400', L: '400', Me: '400', W: '404' } as const satisfies Record<Role, Outcome>
/** Nobody can address it (unknown / malformed id). */
export const NONE = { M: '404', L: '404', Me: '404', W: '404' } as const satisfies Record<Role, Outcome>
/** Q's markers: the manager sees every project and the outsider is Q's MEMBER (world: Q members = [outsider]) → allow;
 *  lead and member are not in Q → 404 (SPEC §3.2 PERM-29: MEMBER may plan). plan/m07.1 §7.2 lists W as 404 for
 *  PM-CROSS — that assumes W is not in Q; in the shared world W is, so SPEC §3.2 gives allow. */
export const Q_TEAM = { M: 'allow', L: '404', Me: '404', W: 'allow' } as const satisfies Record<Role, Outcome>

/** Every M7.1 marker row runs on the planMarkers world (P / Q / A + four live markers). */
export const MARKER_WORLD = ['planMarkers'] as const satisfies readonly WorldPart[]

export const MARKERS_ROUTE = 'GET /api/projects/[id]/plan-markers'

/** `GET /api/projects/{id}/plan-markers` as the current asUser() session. */
export function markersGet(projectId: string): Promise<Response> {
  return callRoute(GET_MARKERS, `/api/projects/${projectId}/plan-markers`, { id: projectId })
}

/** Inserts live markers on a project until it holds `total` live markers (counts the world's own ones). */
export async function fillMarkers(o: {
  projectId: string
  existing: number
  total: number
  createdBy: string | { id: string }
  from?: ISODate
}): Promise<void> {
  const from = o.from ?? '2027-01-01'
  for (let i = o.existing; i < o.total; i++)
    await makePlanMarker({ projectId: o.projectId, date: addDays(from, i), color: 'YELLOW', createdBy: o.createdBy })
}

/** P holds 2 live markers in the world; `fillToLimit` brings it to exactly PLAN_MARKER_LIMIT (100). */
export const P_WORLD_MARKERS = 2
export const LIMIT = PLAN_MARKER_LIMIT

/** A soft-deleted marker on a project with a fresh batch (restore rows; deleted "now" → inside the 30-day window). */
export async function deletedMarker(o: {
  projectId: string
  createdBy: string | { id: string }
  date?: ISODate
  color?: PlanMarkerColor
  label?: string | null
}): Promise<{ id: string; batch: string }> {
  const batch = randomUUID()
  const m = await makePlanMarker({
    projectId: o.projectId,
    date: o.date ?? '2026-10-30',
    color: o.color ?? 'RED',
    label: o.label ?? 'ลบแล้ว',
    createdBy: o.createdBy,
    deleted: { daysAgo: 0, batch },
  })
  return { id: m.id, batch }
}
