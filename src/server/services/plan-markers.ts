// src/server/services/plan-markers.ts — plan markers (SPEC §7.10, FR-819, BR-102, M7.1-D11/D13/D14; plan/m07.1 S2.2).
// `(tx, user, input)`; never opens its own transaction (the action / route does). `list` authorises itself (the route
// delegates to it, like listProjectTasks); the writes run after the action's authz.requireProject(…, 'edit') and leave
// the audit row to the action (X44). Limit 100 live markers per project, checked after
// `select … from projects where id = $1 for update` (M7.1-D13). No `today` needed (X56).
import { randomUUID } from 'node:crypto'
import { th } from '@/i18n/th'
import type {
  DeletePlanMarkerResult,
  PlanMarkerDTO,
  PlanMarkerResult,
  PlanMarkersResponse,
  RestorePlanMarkerBatchResult,
  UpdatePlanMarkerResult,
} from '@/lib/contracts/plan-markers'
import {
  PLAN_MARKER_LIMIT,
  type createPlanMarkerSchema,
  type deletePlanMarkerSchema,
  type restorePlanMarkerBatchSchema,
  type updatePlanMarkerSchema,
} from '@/lib/schemas/plan-markers'
import type { z } from '@/lib/z'
import * as authz from '../authz'
import type { DbOrTx } from '../db/types'
import { ConflictError, NotFoundError, ValidationError } from '../errors'
import * as repo from '../repo'
import type { PlanMarkerRow } from '../repo/plan-markers'
import type { SessionUser } from '../session'

export type CreatePlanMarker = z.output<typeof createPlanMarkerSchema>
export type UpdatePlanMarker = z.output<typeof updatePlanMarkerSchema>
export type DeletePlanMarker = z.output<typeof deletePlanMarkerSchema>
export type RestorePlanMarkerBatch = z.output<typeof restorePlanMarkerBatchSchema>

export function toPlanMarkerDTO(r: PlanMarkerRow): PlanMarkerDTO {
  return {
    id: r.id,
    projectId: r.projectId,
    date: r.date,
    color: r.color,
    label: r.label,
    createdBy: r.createdBy,
    updatedAt: r.updatedAt.toISOString(),
  }
}

const limitError = (): ValidationError => {
  const message = th.planMarkers.errors.limit(PLAN_MARKER_LIMIT)
  return new ValidationError({ projectId: [message] }, message)
}

/** Locks the project row, then refuses when `adding` more live markers would exceed the limit. */
async function assertRoom(tx: DbOrTx, projectId: string, adding: number): Promise<void> {
  await repo.planMarkers.lockProject(tx, projectId)
  if ((await repo.planMarkers.countLive(tx, projectId)) + adding > PLAN_MARKER_LIMIT) throw limitError()
}

/** GET /api/projects/[id]/plan-markers body: live markers ordered by (date, created_at). Authz first: invisible or
 *  malformed id → 404, archived readable (PERM-06, X86). */
export async function list(
  tx: DbOrTx,
  user: SessionUser,
  input: { projectId: string },
): Promise<PlanMarkersResponse> {
  await authz.requireProject(tx, user, input.projectId, 'view')
  const rows = await repo.planMarkers.listLive(tx, input.projectId)
  return { markers: rows.map(toPlanMarkerDTO) }
}

/** ≥ 100 live markers → ValidationError(th.planMarkers.errors.limit(100)). Label already trimmed / '' → null by zod. */
export async function create(
  tx: DbOrTx,
  user: SessionUser,
  input: CreatePlanMarker,
): Promise<PlanMarkerResult> {
  await assertRoom(tx, input.projectId, 1)
  const row = await repo.planMarkers.insert(tx, {
    projectId: input.projectId,
    date: input.date,
    color: input.color,
    label: input.label ?? null,
    createdBy: user.id,
  })
  return { marker: toPlanMarkerDTO(row) }
}

/** Last write wins; returns `previous` for undo (M7.1-D13). Missing / deleted marker → NotFoundError. */
export async function update(
  tx: DbOrTx,
  _user: SessionUser,
  input: UpdatePlanMarker,
): Promise<UpdatePlanMarkerResult> {
  const before = await repo.planMarkers.getOrNull(tx, input.markerId)
  if (!before) throw new NotFoundError()
  const patch: Parameters<typeof repo.planMarkers.update>[2] = {}
  if (input.date !== undefined) patch.date = input.date
  if (input.color !== undefined) patch.color = input.color
  if (input.label !== undefined) patch.label = input.label
  const row = await repo.planMarkers.update(tx, before.id, patch)
  return {
    marker: toPlanMarkerDTO(row),
    previous: { date: before.date, color: before.color, label: before.label },
  }
}

/** Soft delete with a new `deleted_batch`; undo = restore({ batch }). Not live → NotFoundError. */
export async function remove(
  tx: DbOrTx,
  _user: SessionUser,
  input: DeletePlanMarker,
): Promise<DeletePlanMarkerResult> {
  const batch = randomUUID()
  const row = await repo.planMarkers.softDelete(tx, input.markerId, batch)
  if (!row) throw new NotFoundError()
  return { batch, projectId: row.projectId }
}

/** §7.5: within 30 days (DB clock) and the limit is re-checked under the project lock. Unknown / already restored
 *  batch → NotFoundError; expired → CONFLICT. */
export async function restore(
  tx: DbOrTx,
  _user: SessionUser,
  input: RestorePlanMarkerBatch,
): Promise<RestorePlanMarkerBatchResult> {
  const rows = await repo.planMarkers.listBatch(tx, input.batch)
  const first = rows[0]
  if (!first) throw new NotFoundError()
  if (rows.some((r) => !r.withinWindow))
    throw new ConflictError('CONFLICT', th.planMarkers.errors.restoreExpired)
  await assertRoom(tx, first.projectId, rows.length)
  const restored = new Set((await repo.planMarkers.restoreBatch(tx, input.batch)).map((r) => r.id))
  const markers = (await repo.planMarkers.listLive(tx, first.projectId)).filter((r) => restored.has(r.id))
  return { markers: markers.map(toPlanMarkerDTO), projectId: first.projectId }
}
