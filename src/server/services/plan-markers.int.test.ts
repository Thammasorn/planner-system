// M7.1 S2 — plan markers (SPEC §7.10, §3.2 PERM-29, FR-819, M7.1-D11/D13/D14/D15, X41/X42/X44/X86): the four
// actions (zod → service [authz first] → audit in one tx) and GET /api/projects/[id]/plan-markers.
import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { GET as getMarkers } from '@/app/api/projects/[id]/plan-markers/route'
import { th } from '@/i18n/th'
import type { PlanMarkersResponse } from '@/lib/contracts/plan-markers'
import { PLAN_MARKER_LIMIT } from '@/lib/schemas/plan-markers'
import {
  createPlanMarker,
  deletePlanMarker,
  restorePlanMarkerBatch,
  updatePlanMarker,
} from '@/server/actions/plan-markers'
import { callRoute, okJson } from '../../../tests/authz/_support/http'
import { asUser } from '../../../tests/helpers/as-user'
import { makePlanMarker } from '../../../tests/helpers/factories'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { auditLog, planMarkers, projects } from '../db/schema'
import * as planMarkerService from './plan-markers'

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`)
  return r as Extract<T, { ok: true }>
}

const markerAudits = () =>
  db.select().from(auditLog).where(eq(auditLog.entity, 'plan_marker')).orderBy(asc(auditLog.id))
const world = () => createWorld({ with: ['planMarkers'] })
const list = async (projectId: string) =>
  okJson<PlanMarkersResponse>(
    await callRoute(getMarkers, `/api/projects/${projectId}/plan-markers`, { id: projectId }),
  )

async function fill(w: World, n: number): Promise<void> {
  await db
    .insert(planMarkers)
    .values(
      Array.from({ length: n }, () => ({
        projectId: w.P.id,
        date: '2026-12-04',
        color: 'RED' as const,
        createdBy: w.lead.id,
      })),
    )
}

describe('GET /api/projects/[id]/plan-markers (PERM-06, M7.1-D15)', () => {
  it('returns live markers ordered by (date, created_at); deleted ones are not sent', async () => {
    const w = await world()
    const gone = await makePlanMarker({
      projectId: w.P.id,
      date: '2026-10-01',
      createdBy: w.lead,
      deleted: { daysAgo: 1, batch: randomUUID() },
    })
    const sameDay = await makePlanMarker({
      projectId: w.P.id,
      date: '2026-10-23',
      color: 'YELLOW',
      createdBy: w.lead,
    })
    asUser(w.member)
    const body = await list(w.P.id)
    expect(body.markers.map((m) => m.id)).toEqual([
      w.planMarkers.pRed.id,
      sameDay.id,
      w.planMarkers.pGreen.id,
    ])
    expect(body.markers.some((m) => m.id === gone.id)).toBe(false)
    expect(body.markers[0]).toEqual({
      id: w.planMarkers.pRed.id,
      projectId: w.P.id,
      date: '2026-10-23',
      color: 'RED',
      label: 'UAT sign-off',
      createdBy: w.lead.id,
      updatedAt: w.planMarkers.pRed.updatedAt.toISOString(),
    })
  })

  it('archived project is readable; invisible project and malformed id → 404 (X41, X86)', async () => {
    const w = await world()
    asUser(w.member)
    expect((await list(w.A.id)).markers.map((m) => m.id)).toEqual([w.planMarkers.aYellow.id])
    const invisible = await callRoute(getMarkers, `/api/projects/${w.Q.id}/plan-markers`, { id: w.Q.id })
    expect(invisible.status).toBe(404)
    const bad = await callRoute(getMarkers, '/api/projects/not-a-uuid/plan-markers', { id: 'not-a-uuid' })
    expect(bad.status).toBe(404)
    asUser(w.manager)
    expect((await list(w.Q.id)).markers.map((m) => m.id)).toEqual([w.planMarkers.qRed.id])
  })
})

describe('createPlanMarker / updatePlanMarker / deletePlanMarker / restorePlanMarkerBatch', () => {
  it('CRUD round trip with one audit row per mutation (entity plan_marker, projectId, X44)', async () => {
    const w = await world()
    asUser(w.member)
    const created = ok(
      await createPlanMarker({
        projectId: w.P.id,
        date: '2026-10-30',
        color: 'YELLOW',
        label: '  ส่งลูกค้า  ',
      }),
    )
    expect(created.marker).toMatchObject({
      projectId: w.P.id,
      date: '2026-10-30',
      color: 'YELLOW',
      label: 'ส่งลูกค้า',
      createdBy: w.member.id,
    })
    const id = created.marker.id

    const updated = ok(await updatePlanMarker({ markerId: id, color: 'GREEN', date: '2026-11-02' }))
    expect(updated.marker).toMatchObject({ id, color: 'GREEN', date: '2026-11-02', label: 'ส่งลูกค้า' })
    expect(updated.previous).toEqual({ date: '2026-10-30', color: 'YELLOW', label: 'ส่งลูกค้า' })

    // undo = updatePlanMarker(previous)
    const undone = ok(await updatePlanMarker({ markerId: id, ...updated.previous }))
    expect(undone.marker).toMatchObject({ date: '2026-10-30', color: 'YELLOW', label: 'ส่งลูกค้า' })

    const del = ok(await deletePlanMarker({ markerId: id }))
    expect(del.projectId).toBe(w.P.id)
    expect((await list(w.P.id)).markers.some((m) => m.id === id)).toBe(false)

    const restored = ok(await restorePlanMarkerBatch({ batch: del.batch }))
    expect(restored.projectId).toBe(w.P.id)
    expect(restored.markers.map((m) => m.id)).toEqual([id])
    expect((await list(w.P.id)).markers.some((m) => m.id === id)).toBe(true)

    const audits = await markerAudits()
    expect(audits.map((a) => a.action)).toEqual(['create', 'update', 'update', 'delete', 'restore'])
    for (const a of audits) {
      expect(a).toMatchObject({ entityId: id, projectId: w.P.id, actorId: w.member.id })
      expect(a.summary).toEqual(expect.any(String))
    }
    expect(audits[0]!.summary).toContain('ส่งลูกค้า')
  })

  it('labels: trimmed, blank → null, null clears, > 80 chars → VALIDATION (M7.1-D14)', async () => {
    const w = await world()
    asUser(w.lead)
    const blank = ok(
      await createPlanMarker({ projectId: w.P.id, date: '2026-10-30', color: 'RED', label: '   ' }),
    )
    expect(blank.marker.label).toBeNull()
    const noLabel = ok(await createPlanMarker({ projectId: w.P.id, date: '2026-10-30', color: 'RED' }))
    expect(noLabel.marker.label).toBeNull()
    const cleared = ok(await updatePlanMarker({ markerId: w.planMarkers.pRed.id, label: null }))
    expect(cleared.marker.label).toBeNull()
    expect(cleared.previous.label).toBe('UAT sign-off')
    const long = await createPlanMarker({
      projectId: w.P.id,
      date: '2026-10-30',
      color: 'RED',
      label: 'x'.repeat(81),
    })
    expect(long).toMatchObject({ ok: false, code: 'VALIDATION' })
    const badColor = await createPlanMarker({
      projectId: w.P.id,
      date: '2026-10-30',
      color: 'BLUE' as 'RED',
    })
    expect(badColor).toMatchObject({ ok: false, code: 'VALIDATION' })
    const badDate = await createPlanMarker({ projectId: w.P.id, date: '2026-02-30', color: 'RED' })
    expect(badDate).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect((await markerAudits()).length).toBe(3)
  })

  it(`limit ${PLAN_MARKER_LIMIT} live markers per project → VALIDATION; deleted markers do not count`, async () => {
    const w = await world()
    await fill(w, PLAN_MARKER_LIMIT - 2) // + pRed + pGreen = 100
    await makePlanMarker({
      projectId: w.P.id,
      date: '2026-10-01',
      createdBy: w.lead,
      deleted: { daysAgo: 1, batch: randomUUID() },
    })
    asUser(w.lead)
    const res = await createPlanMarker({ projectId: w.P.id, date: '2026-10-30', color: 'RED' })
    expect(res).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.planMarkers.errors.limit(PLAN_MARKER_LIMIT),
    })
    // another project is unaffected
    asUser(w.manager)
    ok(await createPlanMarker({ projectId: w.Q.id, date: '2026-10-30', color: 'RED' }))
  })

  it('two concurrent creates at 99 live markers: exactly one succeeds (project row lock, M7.1-D13)', async () => {
    const w = await world()
    await fill(w, PLAN_MARKER_LIMIT - 3) // + pRed + pGreen = 99
    asUser(w.lead)
    const results = await Promise.all([
      createPlanMarker({ projectId: w.P.id, date: '2026-10-30', color: 'RED', label: 'a' }),
      createPlanMarker({ projectId: w.P.id, date: '2026-10-30', color: 'GREEN', label: 'b' }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([expect.objectContaining({ code: 'VALIDATION' })])
    expect((await list(w.P.id)).markers).toHaveLength(PLAN_MARKER_LIMIT)
  })

  it('a create while another uncommitted create holds the 100th slot waits for it and then fails (deterministic race)', async () => {
    const w = await world()
    await fill(w, PLAN_MARKER_LIMIT - 3) // + pRed + pGreen = 99
    const user = asUser(w.lead)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let second: Promise<{ ok: boolean; code?: string }> | undefined
    await db.transaction(async (tx) => {
      await planMarkerService.create(tx, user, {
        projectId: w.P.id,
        date: '2026-10-30',
        color: 'RED',
        label: 'first',
      })
      // tx holds the project row lock and an uncommitted 100th marker; without the lock the second create would count 99
      second = createPlanMarker({ projectId: w.P.id, date: '2026-10-30', color: 'GREEN', label: 'second' })
      setTimeout(release, 300)
      await gate
    })
    expect(await second).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect((await list(w.P.id)).markers).toHaveLength(PLAN_MARKER_LIMIT)
  })

  it('restore re-checks the limit, and refuses batches deleted more than 30 days ago (§7.5)', async () => {
    const w = await world()
    asUser(w.lead)
    const del = ok(await deletePlanMarker({ markerId: w.planMarkers.pGreen.id }))
    await fill(w, PLAN_MARKER_LIMIT - 1) // pRed + 99 = 100 live
    const full = await restorePlanMarkerBatch({ batch: del.batch })
    expect(full).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.planMarkers.errors.limit(PLAN_MARKER_LIMIT),
    })

    const oldBatch = randomUUID()
    await makePlanMarker({
      projectId: w.Q.id,
      date: '2026-10-01',
      createdBy: w.manager,
      deleted: { daysAgo: 31, batch: oldBatch },
    })
    asUser(w.manager)
    const old = await restorePlanMarkerBatch({ batch: oldBatch })
    expect(old).toMatchObject({ ok: false, code: 'CONFLICT' })
    expect(await restorePlanMarkerBatch({ batch: randomUUID() })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
  })

  it('update / delete of a deleted or unknown marker → NOT_FOUND; restoring twice → NOT_FOUND', async () => {
    const w = await world()
    asUser(w.lead)
    const del = ok(await deletePlanMarker({ markerId: w.planMarkers.pRed.id }))
    expect(await updatePlanMarker({ markerId: w.planMarkers.pRed.id, color: 'GREEN' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    expect(await deletePlanMarker({ markerId: w.planMarkers.pRed.id })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    expect(await updatePlanMarker({ markerId: randomUUID(), color: 'GREEN' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    ok(await restorePlanMarkerBatch({ batch: del.batch }))
    expect(await restorePlanMarkerBatch({ batch: del.batch })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })

  it('archived project → FORBIDDEN for every write, nothing written, no audit (X42)', async () => {
    const w = await world()
    asUser(w.lead)
    expect(await createPlanMarker({ projectId: w.A.id, date: '2026-10-30', color: 'RED' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    const m = w.planMarkers.aYellow
    expect(await updatePlanMarker({ markerId: m.id, color: 'GREEN' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    expect(await deletePlanMarker({ markerId: m.id })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    const batch = randomUUID()
    await makePlanMarker({
      projectId: w.A.id,
      date: '2026-10-02',
      createdBy: w.lead,
      deleted: { daysAgo: 1, batch },
    })
    expect(await restorePlanMarkerBatch({ batch })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    const [row] = await db.select().from(planMarkers).where(eq(planMarkers.id, m.id))
    expect(row).toMatchObject({ color: 'YELLOW', deletedAt: null })
    expect(await markerAudits()).toHaveLength(0)
  })

  it('invisible project → NOT_FOUND for every write, incl. a marker of that project (X41)', async () => {
    const w = await world()
    asUser(w.member)
    expect(await createPlanMarker({ projectId: w.Q.id, date: '2026-10-30', color: 'RED' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    const q = w.planMarkers.qRed
    expect(await updatePlanMarker({ markerId: q.id, color: 'GREEN' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    expect(await deletePlanMarker({ markerId: q.id })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    const batch = randomUUID()
    await makePlanMarker({
      projectId: w.Q.id,
      date: '2026-10-02',
      createdBy: w.manager,
      deleted: { daysAgo: 1, batch },
    })
    expect(await restorePlanMarkerBatch({ batch })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    expect(await markerAudits()).toHaveLength(0)
  })

  it('markers cascade with a hard-deleted project', async () => {
    const w = await world()
    await db.delete(projects).where(eq(projects.id, w.P.id))
    const left = await db.select().from(planMarkers).where(eq(planMarkers.projectId, w.P.id))
    expect(left).toHaveLength(0)
  })
})
