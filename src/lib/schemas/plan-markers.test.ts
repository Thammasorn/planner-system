import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import {
  createPlanMarkerSchema,
  deletePlanMarkerSchema,
  PLAN_MARKER_LABEL_MAX,
  PLAN_MARKER_LIMIT,
  restorePlanMarkerBatchSchema,
  updatePlanMarkerSchema,
} from './plan-markers'

const P = '0b9f0c6e-6a43-4c8e-9d43-2f6f7c1b2a10'
const M = '6f1e2d3c-4b5a-4f60-8e71-a2b3c4d5e6f7'

describe('plan-marker schemas (FR-819, M7.1-D14)', () => {
  it('limit and label max are the SPEC numbers', () => {
    expect(PLAN_MARKER_LIMIT).toBe(100)
    expect(PLAN_MARKER_LABEL_MAX).toBe(80)
  })

  it('create: trims the label, "" / whitespace → null, omitted stays undefined', () => {
    const base = { projectId: P, date: '2026-10-23', color: 'RED' as const }
    expect(createPlanMarkerSchema.parse({ ...base, label: '  UAT sign-off  ' }).label).toBe('UAT sign-off')
    expect(createPlanMarkerSchema.parse({ ...base, label: '   ' }).label).toBeNull()
    expect(createPlanMarkerSchema.parse({ ...base, label: null }).label).toBeNull()
    expect(createPlanMarkerSchema.parse(base).label).toBeUndefined()
  })

  it('create: 80 chars ok, 81 → error with the Thai message', () => {
    const base = { projectId: P, date: '2026-10-23', color: 'GREEN' as const }
    expect(createPlanMarkerSchema.safeParse({ ...base, label: 'ก'.repeat(80) }).success).toBe(true)
    const r = createPlanMarkerSchema.safeParse({ ...base, label: 'ก'.repeat(81) })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe(th.planMarkers.errors.label(80))
  })

  it('create: rejects bad uuid, bad date, unknown colour', () => {
    expect(
      createPlanMarkerSchema.safeParse({ projectId: 'x', date: '2026-10-23', color: 'RED' }).success,
    ).toBe(false)
    expect(createPlanMarkerSchema.safeParse({ projectId: P, date: '2026-02-30', color: 'RED' }).success).toBe(
      false,
    )
    expect(
      createPlanMarkerSchema.safeParse({ projectId: P, date: '2026-10-23', color: 'BLUE' }).success,
    ).toBe(false)
  })

  it('update: needs at least one field; label null clears', () => {
    expect(updatePlanMarkerSchema.safeParse({ markerId: M }).success).toBe(false)
    expect(updatePlanMarkerSchema.parse({ markerId: M, color: 'YELLOW' })).toEqual({
      markerId: M,
      color: 'YELLOW',
    })
    expect(updatePlanMarkerSchema.parse({ markerId: M, label: '' })).toEqual({ markerId: M, label: null })
    expect(updatePlanMarkerSchema.parse({ markerId: M, date: '2026-11-06' }).date).toBe('2026-11-06')
    expect(updatePlanMarkerSchema.safeParse({ markerId: 'nope', color: 'RED' }).success).toBe(false)
  })

  it('delete / restore take uuids', () => {
    expect(deletePlanMarkerSchema.safeParse({ markerId: M }).success).toBe(true)
    expect(deletePlanMarkerSchema.safeParse({ markerId: '1' }).success).toBe(false)
    expect(restorePlanMarkerBatchSchema.safeParse({ batch: M }).success).toBe(true)
    expect(restorePlanMarkerBatchSchema.safeParse({}).success).toBe(false)
  })
})
