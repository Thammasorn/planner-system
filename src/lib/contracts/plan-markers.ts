// src/lib/contracts/plan-markers.ts — plan-marker DTOs (SPEC §7.10, FR-819/820, D24; plan/m07.1 S0.3). Type-only, isomorphic.
import type { ISODate } from '@/domain/types'

export type PlanMarkerColor = 'RED' | 'YELLOW' | 'GREEN'
export const PLAN_MARKER_COLORS: readonly PlanMarkerColor[] = ['RED', 'YELLOW', 'GREEN']

/** One live marker of a project. `updatedAt` = ISO timestamp. */
export interface PlanMarkerDTO {
  id: string
  projectId: string
  date: ISODate
  color: PlanMarkerColor
  label: string | null
  createdBy: string
  updatedAt: string
}

/** GET /api/projects/[id]/plan-markers — live markers ordered by (date, created_at). */
export interface PlanMarkersResponse {
  markers: PlanMarkerDTO[]
}

export interface CreatePlanMarkerInput {
  projectId: string
  date: ISODate
  color: PlanMarkerColor
  label?: string | null
}
/** Last write wins (M7.1-D13); at least one of date / color / label. */
export interface UpdatePlanMarkerInput {
  markerId: string
  date?: ISODate
  color?: PlanMarkerColor
  label?: string | null
}
export interface PlanMarkerResult {
  marker: PlanMarkerDTO
}
/** `previous` = the values before the write; undo = updatePlanMarker({ markerId, ...previous }). */
export interface UpdatePlanMarkerResult {
  marker: PlanMarkerDTO
  previous: Pick<PlanMarkerDTO, 'date' | 'color' | 'label'>
}
/** Undo = restorePlanMarkerBatch({ batch }). */
export interface DeletePlanMarkerResult {
  batch: string
  projectId: string
}
export interface RestorePlanMarkerBatchResult {
  markers: PlanMarkerDTO[]
  projectId: string
}

/** One layer for plan markers (M7.1) and milestones (M8, D24). */
export type MarkerTone = PlanMarkerColor | 'MILESTONE'
export interface GridMarkerView {
  id: string
  source: 'PLAN' | 'MILESTONE'
  date: ISODate
  tone: MarkerTone
  label: string | null
  editable: boolean
}
