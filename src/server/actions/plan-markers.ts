'use server'
// src/server/actions/plan-markers.ts — plan markers (SPEC §7.10, §3.2 PERM-29, FR-819, X41/X42/X44; plan/m07.1 S2.3).
// Shape: zod → db.transaction(authz.requireProject(…, 'edit') [archived → 403, invisible → 404] →
// services.planMarkers.* → audit `plan_marker`, one row per marker) → result. For update / delete / restore the owning
// project comes from the marker (missing / deleted marker or unknown batch → 404 before any authz detail leaks).
// No revalidateTag (X47); TanStack: the caller runs invalidatePlanMarkers (X82).
import { th } from '@/i18n/th'
import type {
  DeletePlanMarkerResult,
  PlanMarkerResult,
  RestorePlanMarkerBatchResult,
  UpdatePlanMarkerResult,
} from '@/lib/contracts/plan-markers'
import { formatThaiDate } from '@/lib/format'
import {
  createPlanMarkerSchema,
  deletePlanMarkerSchema,
  restorePlanMarkerBatchSchema,
  updatePlanMarkerSchema,
} from '@/lib/schemas/plan-markers'
import { action } from '../action'
import * as audit from '../audit'
import * as authz from '../authz'
import { db } from '../db/client'
import { NotFoundError } from '../errors'
import * as repo from '../repo'
import * as services from '../services'

const snapshot = (m: { date: string; color: string; label: string | null }) => ({
  date: m.date,
  color: m.color,
  label: m.label,
})

export const createPlanMarker = action(
  createPlanMarkerSchema,
  async (input, { user }): Promise<PlanMarkerResult> =>
    db.transaction(async (tx) => {
      await authz.requireProject(tx, user, input.projectId, 'edit')
      const r = await services.planMarkers.create(tx, user, input)
      await audit.log(tx, user, {
        entity: 'plan_marker',
        entityId: r.marker.id,
        action: 'create',
        projectId: r.marker.projectId,
        summary: th.audit.planMarkerCreated(formatThaiDate(r.marker.date), r.marker.label),
        after: snapshot(r.marker),
      })
      return r
    }),
)

/** Last write wins; undo = updatePlanMarker({ markerId, ...previous }) (M7.1-D13). */
export const updatePlanMarker = action(
  updatePlanMarkerSchema,
  async (input, { user }): Promise<UpdatePlanMarkerResult> =>
    db.transaction(async (tx) => {
      const marker = await repo.planMarkers.getOrNull(tx, input.markerId)
      if (!marker) throw new NotFoundError()
      await authz.requireProject(tx, user, marker.projectId, 'edit')
      const r = await services.planMarkers.update(tx, user, input)
      await audit.log(tx, user, {
        entity: 'plan_marker',
        entityId: r.marker.id,
        action: 'update',
        projectId: r.marker.projectId,
        summary: th.audit.planMarkerUpdated(formatThaiDate(r.marker.date), r.marker.label),
        before: r.previous,
        after: snapshot(r.marker),
      })
      return r
    }),
)

/** Undo = restorePlanMarkerBatch({ batch }). */
export const deletePlanMarker = action(
  deletePlanMarkerSchema,
  async (input, { user }): Promise<DeletePlanMarkerResult> =>
    db.transaction(async (tx) => {
      const marker = await repo.planMarkers.getOrNull(tx, input.markerId)
      if (!marker) throw new NotFoundError()
      await authz.requireProject(tx, user, marker.projectId, 'edit')
      const r = await services.planMarkers.remove(tx, user, input)
      await audit.log(tx, user, {
        entity: 'plan_marker',
        entityId: marker.id,
        action: 'delete',
        projectId: marker.projectId,
        summary: th.audit.planMarkerDeleted(formatThaiDate(marker.date), marker.label),
        before: snapshot(marker),
      })
      return r
    }),
)

/** §7.5: authz re-checked on the batch's project; ≤ 30 days; the 100 limit is re-checked. */
export const restorePlanMarkerBatch = action(
  restorePlanMarkerBatchSchema,
  async (input, { user }): Promise<RestorePlanMarkerBatchResult> =>
    db.transaction(async (tx) => {
      const projectId = await repo.planMarkers.batchProjectId(tx, input.batch)
      if (!projectId) throw new NotFoundError()
      await authz.requireProject(tx, user, projectId, 'edit')
      const r = await services.planMarkers.restore(tx, user, input)
      for (const m of r.markers) {
        await audit.log(tx, user, {
          entity: 'plan_marker',
          entityId: m.id,
          action: 'restore',
          projectId: m.projectId,
          summary: th.audit.planMarkerRestored(formatThaiDate(m.date), m.label),
          after: snapshot(m),
        })
      }
      return r
    }),
)
