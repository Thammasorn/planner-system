// src/lib/schemas/plan-markers.ts — plan-marker action inputs (SPEC §7.10, FR-819, M7.1-D13/D14; plan/m07.1 S0.3).
// Labels are trimmed, '' → null, ≤ 80 chars (DB check plan_markers_label_check mirrors it). X47: z.uuid(), z.iso.date().
import { th } from '@/i18n/th'
import { z } from '@/lib/z'
import { isoDateSchema } from './dates'

/** ≤ 100 live markers per project, checked in the service under the project row lock (M7.1-D13). */
export const PLAN_MARKER_LIMIT = 100
export const PLAN_MARKER_LABEL_MAX = 80

export const planMarkerColorSchema = z.enum(['RED', 'YELLOW', 'GREEN'])
const markerDate = isoDateSchema(th.planMarkers.errors.invalidDate)
/** undefined = unchanged / not given; null or '' (after trim) = no label. */
const markerLabel = z
  .string()
  .trim()
  .max(PLAN_MARKER_LABEL_MAX, { error: th.planMarkers.errors.label(PLAN_MARKER_LABEL_MAX) })
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

export const createPlanMarkerSchema = z.object({
  projectId: z.uuid(),
  date: markerDate,
  color: planMarkerColorSchema,
  label: markerLabel,
})

export const updatePlanMarkerSchema = z
  .object({
    markerId: z.uuid(),
    date: markerDate.optional(),
    color: planMarkerColorSchema.optional(),
    label: markerLabel,
  })
  .refine((p) => p.date !== undefined || p.color !== undefined || p.label !== undefined, {
    error: th.planMarkers.errors.noChange,
  })

export const deletePlanMarkerSchema = z.object({ markerId: z.uuid() })
export const restorePlanMarkerBatchSchema = z.object({ batch: z.uuid() })

export type CreatePlanMarkerSchemaInput = z.input<typeof createPlanMarkerSchema>
export type UpdatePlanMarkerSchemaInput = z.input<typeof updatePlanMarkerSchema>
