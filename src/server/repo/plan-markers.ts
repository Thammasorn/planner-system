// src/server/repo/plan-markers.ts — plan_markers queries (SPEC §6.2, §7.10, FR-819; plan/m07.1 S2.1).
// Dates are ISODate strings (date mode 'string'). "Live" = deleted_at is null. Ordered by (date, created_at, id).
import { and, asc, count, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { ISODate } from '@/domain/types'
import type { PlanMarkerColor } from '@/lib/contracts/plan-markers'
import { type PlanMarkerDbRow, planMarkers, projects } from '../db/schema'
import type { DbOrTx } from '../db/types'
import { NotFoundError } from '../errors'

export type PlanMarkerRow = PlanMarkerDbRow

const live = isNull(planMarkers.deletedAt)

/** Live markers of one project, by (date, created_at, id). */
export function listLive(tx: DbOrTx, projectId: string): Promise<PlanMarkerRow[]> {
  return tx
    .select()
    .from(planMarkers)
    .where(and(eq(planMarkers.projectId, projectId), live))
    .orderBy(asc(planMarkers.date), asc(planMarkers.createdAt), asc(planMarkers.id))
}

/** `select … from projects where id = $1 for update` — serialises the 100-marker limit per project (M7.1-D13). */
export async function lockProject(tx: DbOrTx, projectId: string): Promise<void> {
  await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for('update')
}

/** Number of live markers of one project (the 100 limit, M7.1-D13 — call after lockProject). */
export async function countLive(tx: DbOrTx, projectId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(planMarkers)
    .where(and(eq(planMarkers.projectId, projectId), live))
  return row?.n ?? 0
}

export async function insert(
  tx: DbOrTx,
  v: { projectId: string; date: ISODate; color: PlanMarkerColor; label: string | null; createdBy: string },
): Promise<PlanMarkerRow> {
  const [row] = await tx.insert(planMarkers).values(v).returning()
  return row!
}

/** Patch of a live marker (last write wins); bumps updated_at. Throws NotFoundError when the marker is not live. */
export async function update(
  tx: DbOrTx,
  id: string,
  patch: { date?: ISODate; color?: PlanMarkerColor; label?: string | null },
): Promise<PlanMarkerRow> {
  const [row] = await tx
    .update(planMarkers)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(and(eq(planMarkers.id, id), live))
    .returning()
  if (!row) throw new NotFoundError()
  return row
}

/** Sets deleted_at = now(), deleted_batch = batch on a live marker; null when it was not live. */
export async function softDelete(tx: DbOrTx, id: string, batch: string): Promise<PlanMarkerRow | null> {
  const [row] = await tx
    .update(planMarkers)
    .set({ deletedAt: sql`now()`, deletedBatch: batch })
    .where(and(eq(planMarkers.id, id), live))
    .returning()
  return row ?? null
}

/** Deleted markers of a batch with their restore window (deleted < 30 days ago on the DB clock, §7.5). */
export function listBatch(
  tx: DbOrTx,
  batch: string,
): Promise<Array<PlanMarkerRow & { withinWindow: boolean }>> {
  return tx
    .select({
      id: planMarkers.id,
      projectId: planMarkers.projectId,
      date: planMarkers.date,
      color: planMarkers.color,
      label: planMarkers.label,
      createdBy: planMarkers.createdBy,
      createdAt: planMarkers.createdAt,
      updatedAt: planMarkers.updatedAt,
      deletedAt: planMarkers.deletedAt,
      deletedBatch: planMarkers.deletedBatch,
      withinWindow: sql<boolean>`(${planMarkers.deletedAt} > now() - interval '30 days')`,
    })
    .from(planMarkers)
    .where(and(eq(planMarkers.deletedBatch, batch), isNotNull(planMarkers.deletedAt)))
    .orderBy(asc(planMarkers.date), asc(planMarkers.createdAt), asc(planMarkers.id))
}

/** Clears deleted_at / deleted_batch of every marker of the batch; returns the restored rows. */
export function restoreBatch(tx: DbOrTx, batch: string): Promise<PlanMarkerRow[]> {
  return tx
    .update(planMarkers)
    .set({ deletedAt: null, deletedBatch: null })
    .where(and(eq(planMarkers.deletedBatch, batch), isNotNull(planMarkers.deletedAt)))
    .returning()
}

/** The project of a deleted batch (authz lookup for restorePlanMarkerBatch), or null. */
export async function batchProjectId(tx: DbOrTx, batch: string): Promise<string | null> {
  const [row] = await tx
    .select({ projectId: planMarkers.projectId })
    .from(planMarkers)
    .where(and(eq(planMarkers.deletedBatch, batch), isNotNull(planMarkers.deletedAt)))
    .limit(1)
  return row?.projectId ?? null
}

/** A live marker by id, or null. */
export async function getOrNull(tx: DbOrTx, id: string): Promise<PlanMarkerRow | null> {
  const [row] = await tx
    .select()
    .from(planMarkers)
    .where(and(eq(planMarkers.id, id), live))
  return row ?? null
}
