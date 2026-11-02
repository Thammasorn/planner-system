// tests/authz/rows/plan-markers.ts — M7.1 plan markers (SPEC §3.2 last row = PERM-29 เพิ่ม/แก้/ลบ/กู้คืน เส้นกำกับบนแผนงาน
// = สิทธิ์วางแผน; reads = PERM-06 เห็นโปรเจค; §7.10; FR-819; X41/X42/X44/X86; plan/m07.1 S5.1, §7.2). Written from the
// SPEC before S2 writes the bodies (PLAN §4.1): every row is red until S2. Allowed writes assert one `plan_marker` audit
// row with the marker's project (X44). Content leaks across projects → masking.int.test.ts › M7.1 chart.
import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import type { ActionResult } from '@/lib/action-result'
import type { PlanMarkerDTO, PlanMarkersResponse } from '@/lib/contracts/plan-markers'
import {
  createPlanMarker,
  deletePlanMarker,
  restorePlanMarkerBatch,
  updatePlanMarker,
} from '@/server/actions/plan-markers'
import type { World } from '../../helpers/world'
import { defineRow, type AuthzRow } from '../types'
import {
  ARCH,
  BAD,
  deletedMarker,
  fillMarkers,
  LIMIT,
  MARKER_WORLD,
  MARKERS_ROUTE,
  markersGet,
  NONE,
  Q_TEAM,
  P_WORLD_MARKERS,
  VIEW,
  VIEW_400,
} from './_m7_1'

const auditP = { entity: 'plan_marker', projectId: (w: World) => w.P.id } as const
const auditA = { entity: 'plan_marker', projectId: (w: World) => w.A.id } as const
const auditQ = { entity: 'plan_marker', projectId: (w: World) => w.Q.id } as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** On success run content checks; failures pass through to the matrix outcome. */
function checked<T extends object>(r: ActionResult<T>, check: (ok: T) => void): ActionResult<T> {
  if (r.ok) check(r)
  return r
}

/** 200 → body checks; other statuses pass through. */
async function checkedList(res: Response, check: (b: PlanMarkersResponse) => void): Promise<Response> {
  if (res.status === 200) check((await res.clone().json()) as PlanMarkersResponse)
  return res
}

/** Several inputs that must all fail parsing: returns the first result that is not VALIDATION (the matrix then
 *  reports its outcome), else the last one. */
async function allInvalid(calls: (() => Promise<ActionResult<object>>)[]): Promise<ActionResult<object>> {
  let last: ActionResult<object> | undefined
  for (const call of calls) {
    last = await call()
    if (last.ok || String(last.code) !== 'VALIDATION') return last
  }
  return last!
}

const DTO_KEYS = ['color', 'createdBy', 'date', 'id', 'label', 'projectId', 'updatedAt'].sort()
const expectDto = (m: PlanMarkerDTO) => expect(Object.keys(m).sort()).toEqual(DTO_KEYS)

export const rows: AuthzRow[] = [
  // ── reads: PERM-06 เห็นโปรเจค (§7.10 GET; archived readable; malformed id 404) ─────────────────────────────────────
  defineRow({
    id: 'PM-LIST',
    spec: 'PERM-06 §3.2 เห็นโปรเจค + §7.10 — GET /api/projects/{P}/plan-markers: P’s live markers by (date, created_at)',
    action: MARKERS_ROUTE,
    mutates: false,
    with: MARKER_WORLD,
    expect: VIEW,
    run: async (w) =>
      checkedList(await markersGet(w.P.id), (b) => {
        expect(Object.keys(b)).toEqual(['markers'])
        expect(b.markers.map((m) => m.id)).toEqual([w.planMarkers.pRed.id, w.planMarkers.pGreen.id])
        expect(b.markers[0]).toMatchObject({
          projectId: w.P.id,
          date: '2026-10-23',
          color: 'RED',
          label: 'UAT sign-off',
          createdBy: w.lead.id,
        })
        expect(b.markers[1]).toMatchObject({ date: '2026-11-06', color: 'GREEN', label: null })
        b.markers.forEach(expectDto)
      }),
  }),
  defineRow({
    id: 'PM-LIST-DELETED',
    spec: 'PERM-06 + §7.10 — soft-deleted markers are not sent',
    action: MARKERS_ROUTE,
    mutates: false,
    with: MARKER_WORLD,
    expect: VIEW,
    setup: (w) => deletedMarker({ projectId: w.P.id, createdBy: w.lead }),
    run: async (w, gone) =>
      checkedList(await markersGet(w.P.id), (b) => {
        expect(b.markers.map((m) => m.id)).not.toContain(gone.id)
        expect(b.markers).toHaveLength(P_WORLD_MARKERS)
      }),
  }),
  defineRow({
    id: 'PM-LIST-ARCH',
    spec: 'PERM-06 + X42 — archived A: markers stay readable',
    action: MARKERS_ROUTE,
    mutates: false,
    with: MARKER_WORLD,
    expect: VIEW,
    run: async (w) =>
      checkedList(await markersGet(w.A.id), (b) => {
        expect(b.markers.map((m) => m.id)).toEqual([w.planMarkers.aYellow.id])
      }),
  }),
  defineRow({
    id: 'PM-LIST-BADID',
    spec: 'PERM-06 + X86 — GET /api/projects/not-a-uuid/plan-markers is a 404 for everyone',
    action: MARKERS_ROUTE,
    mutates: false,
    with: MARKER_WORLD,
    expect: NONE,
    run: () => markersGet('not-a-uuid'),
  }),
  defineRow({
    id: 'PM-LIST-MISSING',
    spec: 'PERM-06 + X41 — an unknown project id is a 404 for everyone',
    action: MARKERS_ROUTE,
    mutates: false,
    with: MARKER_WORLD,
    expect: NONE,
    run: () => markersGet(randomUUID()),
  }),

  // ── create: PERM-29 (FR-819, M7.1-D14) ───────────────────────────────────────────────────────────────────────────
  defineRow({
    id: 'PM-CREATE',
    spec: 'PERM-29 §3.2 เพิ่มเส้นกำกับบนแผนงาน — createPlanMarker on P; label trimmed (M7.1-D14)',
    action: 'createPlanMarker',
    mutates: true,
    audit: auditP,
    with: MARKER_WORLD,
    expect: VIEW,
    run: async (w, _ctx, actor) =>
      checked(
        await createPlanMarker({ projectId: w.P.id, date: '2026-10-16', color: 'YELLOW', label: '  Key due  ' }),
        (r) => {
          expectDto(r.marker)
          expect(r.marker).toMatchObject({
            projectId: w.P.id,
            date: '2026-10-16',
            color: 'YELLOW',
            label: 'Key due',
            createdBy: actor.id,
          })
          expect(r.marker.id).toMatch(UUID)
        },
      ),
  }),
  defineRow({
    id: 'PM-CREATE-NOLABEL',
    spec: 'PERM-29 + M7.1-D14 — a blank label is stored as null',
    action: 'createPlanMarker',
    mutates: true,
    audit: auditP,
    with: MARKER_WORLD,
    expect: VIEW,
    run: async (w) =>
      checked(await createPlanMarker({ projectId: w.P.id, date: '2026-10-16', color: 'GREEN', label: '   ' }), (r) =>
        expect(r.marker.label).toBeNull(),
      ),
  }),
  defineRow({
    id: 'PM-CREATE-ARCH',
    spec: 'PERM-29 + X42 — createPlanMarker on archived A',
    action: 'createPlanMarker',
    mutates: true,
    audit: auditA,
    with: MARKER_WORLD,
    expect: ARCH,
    run: (w) => createPlanMarker({ projectId: w.A.id, date: '2026-10-16', color: 'RED' }),
  }),
  defineRow({
    id: 'PM-CREATE-CROSS',
    spec: 'PERM-29 — createPlanMarker on Q (lead/member not in Q → 404; manager and Q’s member W → allow)',
    action: 'createPlanMarker',
    mutates: true,
    audit: auditQ,
    with: MARKER_WORLD,
    expect: Q_TEAM,
    run: (w) => createPlanMarker({ projectId: w.Q.id, date: '2026-10-16', color: 'RED' }),
  }),
  defineRow({
    id: 'PM-CREATE-MISSING',
    spec: 'PERM-29 + X41 — createPlanMarker on an unknown project id',
    action: 'createPlanMarker',
    mutates: true,
    audit: auditP,
    with: MARKER_WORLD,
    expect: NONE,
    run: () => createPlanMarker({ projectId: randomUUID(), date: '2026-10-16', color: 'RED' }),
  }),
  defineRow({
    id: 'PM-BAD',
    spec: 'PERM-29 + X41 + M7.1-D14 — createPlanMarker label 81 chars / bad colour / bad date → 400 (parse first)',
    action: 'createPlanMarker',
    mutates: false,
    with: MARKER_WORLD,
    expect: BAD,
    run: (w) =>
      allInvalid([
        () => createPlanMarker({ projectId: w.P.id, date: '2026-10-16', color: 'RED', label: 'x'.repeat(81) }),
        () => createPlanMarker({ projectId: w.P.id, date: '2026-10-16', color: 'BLUE' } as never),
        () => createPlanMarker({ projectId: w.P.id, date: '2026-13-01', color: 'RED' }),
        () => createPlanMarker({ projectId: 'not-a-uuid', date: '2026-10-16', color: 'RED' }),
      ]),
  }),
  defineRow({
    id: 'PM-LIMIT',
    spec: 'PERM-29 + FR-819 + M7.1-D13 — createPlanMarker on P with 100 live markers → VALIDATION (after authz)',
    action: 'createPlanMarker',
    mutates: false,
    with: MARKER_WORLD,
    expect: VIEW_400,
    setup: (w) => fillMarkers({ projectId: w.P.id, existing: P_WORLD_MARKERS, total: LIMIT, createdBy: w.lead }),
    run: (w) => createPlanMarker({ projectId: w.P.id, date: '2026-10-16', color: 'RED' }),
  }),
  defineRow({
    id: 'PM-LIMIT-DELETED',
    spec: 'PERM-29 + M7.1-D13 — only live markers count: 99 live + 1 deleted → the 100th is allowed',
    action: 'createPlanMarker',
    mutates: true,
    audit: auditP,
    with: MARKER_WORLD,
    expect: VIEW,
    setup: async (w) => {
      await fillMarkers({ projectId: w.P.id, existing: P_WORLD_MARKERS, total: LIMIT - 1, createdBy: w.lead })
      await deletedMarker({ projectId: w.P.id, createdBy: w.lead })
    },
    run: (w) => createPlanMarker({ projectId: w.P.id, date: '2026-10-16', color: 'RED' }),
  }),

  // ── update: PERM-29, last write wins, `previous` for undo (M7.1-D13) ─────────────────────────────────────────────
  defineRow({
    id: 'PM-UPDATE',
    spec: 'PERM-29 §3.2 แก้เส้นกำกับ — updatePlanMarker colour → GREEN on P; returns previous (§7.5 undo)',
    action: 'updatePlanMarker',
    mutates: true,
    audit: auditP,
    with: MARKER_WORLD,
    expect: VIEW,
    run: async (w) =>
      checked(await updatePlanMarker({ markerId: w.planMarkers.pRed.id, color: 'GREEN' }), (r) => {
        expectDto(r.marker)
        expect(r.marker).toMatchObject({
          id: w.planMarkers.pRed.id,
          projectId: w.P.id,
          date: '2026-10-23',
          color: 'GREEN',
          label: 'UAT sign-off',
        })
        expect(r.previous).toEqual({ date: '2026-10-23', color: 'RED', label: 'UAT sign-off' })
      }),
  }),
  defineRow({
    id: 'PM-UPDATE-LABEL',
    spec: 'PERM-29 + M7.1-D14 — updatePlanMarker label "" clears it; date moves',
    action: 'updatePlanMarker',
    mutates: true,
    audit: auditP,
    with: MARKER_WORLD,
    expect: VIEW,
    run: async (w) =>
      checked(await updatePlanMarker({ markerId: w.planMarkers.pRed.id, label: '', date: '2026-10-30' }), (r) => {
        expect(r.marker).toMatchObject({ label: null, date: '2026-10-30', color: 'RED' })
        expect(r.previous).toEqual({ date: '2026-10-23', color: 'RED', label: 'UAT sign-off' })
      }),
  }),
  defineRow({
    id: 'PM-UPDATE-ARCH',
    spec: 'PERM-29 + X42 — updatePlanMarker on archived A',
    action: 'updatePlanMarker',
    mutates: true,
    audit: auditA,
    with: MARKER_WORLD,
    expect: ARCH,
    run: (w) => updatePlanMarker({ markerId: w.planMarkers.aYellow.id, color: 'GREEN' }),
  }),
  defineRow({
    id: 'PM-CROSS',
    spec: 'PERM-29 — updatePlanMarker of Q’s marker: roles not in Q (L, Me) → 404; the manager (sees all) and W (Q’s member) → allow',
    action: 'updatePlanMarker',
    mutates: true,
    audit: auditQ,
    with: MARKER_WORLD,
    expect: Q_TEAM,
    run: (w) => updatePlanMarker({ markerId: w.planMarkers.qRed.id, color: 'GREEN' }),
  }),
  defineRow({
    id: 'PM-MISSING',
    spec: 'PERM-29 + X41 — updatePlanMarker of a random uuid',
    action: 'updatePlanMarker',
    mutates: true,
    audit: auditP,
    with: MARKER_WORLD,
    expect: NONE,
    run: () => updatePlanMarker({ markerId: randomUUID(), color: 'GREEN' }),
  }),
  defineRow({
    id: 'PM-UPDATE-DELETED',
    spec: 'PERM-29 — updatePlanMarker of a soft-deleted marker is a 404 (not live)',
    action: 'updatePlanMarker',
    mutates: true,
    audit: auditP,
    with: MARKER_WORLD,
    expect: NONE,
    setup: (w) => deletedMarker({ projectId: w.P.id, createdBy: w.lead }),
    run: (_w, gone) => updatePlanMarker({ markerId: gone.id, color: 'GREEN' }),
  }),
  defineRow({
    id: 'PM-UPDATE-BAD',
    spec: 'PERM-29 + X41 — updatePlanMarker with no field / label 81 / bad id → 400 (parse first)',
    action: 'updatePlanMarker',
    mutates: false,
    with: MARKER_WORLD,
    expect: BAD,
    run: (w) =>
      allInvalid([
        () => updatePlanMarker({ markerId: w.planMarkers.pRed.id }),
        () => updatePlanMarker({ markerId: w.planMarkers.pRed.id, label: 'x'.repeat(81) }),
        () => updatePlanMarker({ markerId: 'not-a-uuid', color: 'GREEN' }),
      ]),
  }),

  // ── delete / restore: PERM-29, §7.5 (batch undo, restore re-checks permission) ───────────────────────────────────
  defineRow({
    id: 'PM-DELETE',
    spec: 'PERM-29 §3.2 ลบเส้นกำกับ — deletePlanMarker on P → { batch } (§7.5)',
    action: 'deletePlanMarker',
    mutates: true,
    audit: auditP,
    with: MARKER_WORLD,
    expect: VIEW,
    run: async (w) =>
      checked(await deletePlanMarker({ markerId: w.planMarkers.pRed.id }), (r) => {
        expect(r.batch).toMatch(UUID)
        expect(r.projectId).toBe(w.P.id)
      }),
  }),
  defineRow({
    id: 'PM-DELETE-ARCH',
    spec: 'PERM-29 + X42 — deletePlanMarker on archived A',
    action: 'deletePlanMarker',
    mutates: true,
    audit: auditA,
    with: MARKER_WORLD,
    expect: ARCH,
    run: (w) => deletePlanMarker({ markerId: w.planMarkers.aYellow.id }),
  }),
  defineRow({
    id: 'PM-DELETE-CROSS',
    spec: 'PERM-29 — deletePlanMarker of Q’s marker (L, Me not in Q → 404; M and W → allow)',
    action: 'deletePlanMarker',
    mutates: true,
    audit: auditQ,
    with: MARKER_WORLD,
    expect: Q_TEAM,
    run: (w) => deletePlanMarker({ markerId: w.planMarkers.qRed.id }),
  }),
  defineRow({
    id: 'PM-DELETE-MISSING',
    spec: 'PERM-29 + X41 — deletePlanMarker of a random uuid',
    action: 'deletePlanMarker',
    mutates: true,
    audit: auditP,
    with: MARKER_WORLD,
    expect: NONE,
    run: () => deletePlanMarker({ markerId: randomUUID() }),
  }),
  defineRow({
    id: 'PM-DELETE-BAD',
    spec: 'PERM-29 + X41 — deletePlanMarker with a malformed id → 400',
    action: 'deletePlanMarker',
    mutates: false,
    with: MARKER_WORLD,
    expect: BAD,
    run: () => deletePlanMarker({ markerId: 'not-a-uuid' }),
  }),
  defineRow({
    id: 'PM-RESTORE',
    spec: 'PERM-29 §3.2 กู้คืนเส้นกำกับ — restorePlanMarkerBatch of a batch deleted by the same role (§7.5)',
    action: 'restorePlanMarkerBatch',
    mutates: true,
    audit: auditP,
    with: MARKER_WORLD,
    expect: VIEW,
    setup: (w, actor) => deletedMarker({ projectId: w.P.id, createdBy: actor, label: 'กู้คืน' }),
    run: async (w, gone) =>
      checked(await restorePlanMarkerBatch({ batch: gone.batch }), (r) => {
        expect(r.projectId).toBe(w.P.id)
        expect(r.markers.map((m) => m.id)).toEqual([gone.id])
        expect(r.markers[0]).toMatchObject({ label: 'กู้คืน', projectId: w.P.id })
      }),
  }),
  defineRow({
    id: 'PM-RESTORE-ARCH',
    spec: 'PERM-29 + X42 + §7.5 (restore re-checks permission) — restorePlanMarkerBatch on archived A',
    action: 'restorePlanMarkerBatch',
    mutates: true,
    audit: auditA,
    with: MARKER_WORLD,
    expect: ARCH,
    setup: (w) => deletedMarker({ projectId: w.A.id, createdBy: w.lead }),
    run: (_w, gone) => restorePlanMarkerBatch({ batch: gone.batch }),
  }),
  defineRow({
    id: 'PM-RESTORE-CROSS',
    spec: 'PERM-29 + §7.5 — restorePlanMarkerBatch of a Q batch (L, Me not in Q → 404; M and W → allow)',
    action: 'restorePlanMarkerBatch',
    mutates: true,
    audit: auditQ,
    with: MARKER_WORLD,
    expect: Q_TEAM,
    setup: (w) => deletedMarker({ projectId: w.Q.id, createdBy: w.manager }),
    run: (_w, gone) => restorePlanMarkerBatch({ batch: gone.batch }),
  }),
  defineRow({
    id: 'PM-RESTORE-MISSING',
    spec: 'PERM-29 + X41 — restorePlanMarkerBatch of an unknown batch',
    action: 'restorePlanMarkerBatch',
    mutates: true,
    audit: auditP,
    with: MARKER_WORLD,
    expect: NONE,
    run: () => restorePlanMarkerBatch({ batch: randomUUID() }),
  }),
  defineRow({
    id: 'PM-RESTORE-BAD',
    spec: 'PERM-29 + X41 — restorePlanMarkerBatch with a malformed batch → 400',
    action: 'restorePlanMarkerBatch',
    mutates: false,
    with: MARKER_WORLD,
    expect: BAD,
    run: () => restorePlanMarkerBatch({ batch: 'not-a-uuid' }),
  }),
  defineRow({
    id: 'PM-RESTORE-LIMIT',
    spec: 'PERM-29 + §7.5 + M7.1-D13 — restore re-checks the 100 limit: P at 100 live → VALIDATION',
    action: 'restorePlanMarkerBatch',
    mutates: false,
    with: MARKER_WORLD,
    expect: VIEW_400,
    setup: async (w) => {
      await fillMarkers({ projectId: w.P.id, existing: P_WORLD_MARKERS, total: LIMIT, createdBy: w.lead })
      return deletedMarker({ projectId: w.P.id, createdBy: w.lead })
    },
    run: (_w, gone) => restorePlanMarkerBatch({ batch: gone.batch }),
  }),
]
