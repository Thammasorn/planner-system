// tests/authz/rows/allocations.ts — M6 PERM-06 (grid read) and PERM-12 (วางแผน: saveAllocations, planAssignmentRange)
// rows, written from SPEC §3.2 before the services exist (PLAN §4.1; plan/m06 S5.1, §7.2). World
// createWorld({ with: ['allocations'] }) (plan/m06 S0.11). Single-item `allow` writes assert exactly one `allocation`
// audit row with project_id = P (X44, M6-D29). Rows that must not write also assert in `run` that the touched week
// and the assignment version are unchanged (all-or-nothing, M6-D3/D34) — `run` also executes in the nobody and
// mustChangePassword loops, where nothing may be written either. Grid content leaks → masking.int.test.ts › grid (M6).
import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { ActionResult } from '@/lib/action-result'
import type { GridResponse, PlanAssignmentRangeOk } from '@/lib/contracts/grid'
import { allocationRows, assignmentVersion } from '../../helpers/factories'
import { defineRow, type AuthzRow } from '../types'
import {
  ALLOC,
  ARCH_WRITE,
  auditAllocationP,
  each,
  GRID_RANGE,
  gridGet,
  planRange,
  PROJ,
  PROJ_400,
  PROJ_409,
  save,
  weekItem,
} from './_m6'

type Snapshot = { rows: Awaited<ReturnType<typeof allocationRows>>; version: number }

/** Rows of one (assignment, week) + the assignment version — taken in `setup`, compared after a refused write. */
async function snapshot(assignmentId: string, week: ISODate): Promise<Snapshot> {
  return { rows: await allocationRows(assignmentId, week), version: await assignmentVersion(assignmentId) }
}

async function expectUnchanged(assignmentId: string, week: ISODate, before: Snapshot): Promise<void> {
  expect(await snapshot(assignmentId, week), `${assignmentId} ${week} must be unchanged`).toEqual(before)
}

/** 200 → body checks of a successful grid read (the content itself is the masking suite's job). */
async function expectGrid(res: Response, check: (body: GridResponse) => void): Promise<Response> {
  if (res.status === 200) check((await res.clone().json()) as GridResponse)
  return res
}

const isOk = <T extends object>(r: ActionResult<T>): r is { ok: true } & T => r.ok

export const rows: AuthzRow[] = [
  // ── GET /api/grid/project/[projectId] (PERM-06, X41/X42/X65/X86) ─────────────────────────────────────────────
  defineRow({
    id: 'GR-READ',
    spec: 'PERM-06 §3.2 เปิดโปรเจค — GET /api/grid/project/{P} one 8-week chunk',
    action: 'GET /api/grid/project/[projectId]',
    mutates: false,
    with: ALLOC,
    expect: PROJ,
    run: async (w) =>
      expectGrid(await gridGet(w.P.id, GRID_RANGE), (b) => {
        expect(b.context).toMatchObject({ kind: 'project', id: w.P.id, archived: false, canEdit: true })
        expect(b.window).toMatchObject({ from: '2026-09-28', to: '2026-11-23', includeOthers: false })
        expect(b.periods).toHaveLength(8)
      }),
  }),
  defineRow({
    id: 'GR-ARCH',
    spec: 'PERM-06 + X42 — archived A stays readable (banner), nothing editable',
    action: 'GET /api/grid/project/[projectId]',
    mutates: false,
    with: ALLOC,
    expect: PROJ,
    run: async (w) =>
      expectGrid(await gridGet(w.A.id, GRID_RANGE), (b) => {
        expect(b.context).toMatchObject({ id: w.A.id, archived: true, canEdit: false })
        for (const r of b.rows) if (r.kind === 'assignee') expect(r.editable).toBe(false)
      }),
  }),
  defineRow({
    id: 'GR-OTHERS',
    spec: 'PERM-06 + X29 — includeOthers=1 (footer switch; numbers only → masking suite)',
    action: 'GET /api/grid/project/[projectId]',
    mutates: false,
    with: ALLOC,
    expect: PROJ,
    run: async (w) =>
      expectGrid(await gridGet(w.P.id, `${GRID_RANGE}&includeOthers=1`), (b) => {
        expect(b.window.includeOthers).toBe(true)
      }),
  }),
  defineRow({
    id: 'GR-DEFAULT',
    spec: 'PERM-06 + X65 — no from/to → default window −4/+12 weeks around today (2026-09-30)',
    action: 'GET /api/grid/project/[projectId]',
    mutates: false,
    with: ALLOC,
    expect: PROJ,
    run: async (w) =>
      expectGrid(await gridGet(w.P.id), (b) => {
        expect(b.window).toMatchObject({ from: '2026-08-31', to: '2026-12-21' })
        expect(b.periods).toHaveLength(16)
        expect(b.today).toBe('2026-09-30')
      }),
  }),
  defineRow({
    id: 'GR-MISSING',
    spec: 'X41 — a project id that does not exist is a 404 for everyone (never reveals existence)',
    action: 'GET /api/grid/project/[projectId]',
    mutates: false,
    with: ALLOC,
    expect: each('404'),
    run: () => gridGet(randomUUID(), GRID_RANGE),
  }),
  defineRow({
    id: 'GR-BADID',
    spec: 'X86 — a malformed project id is a 404 (not a 400) for everyone',
    action: 'GET /api/grid/project/[projectId]',
    mutates: false,
    with: ALLOC,
    expect: each('404'),
    run: () => gridGet('not-a-uuid', GRID_RANGE),
  }),
  defineRow({
    id: 'GR-BADQ',
    spec: 'X41/X65 — `from` that is not a Monday is a 400 for everyone (parse precedes authz)',
    action: 'GET /api/grid/project/[projectId]',
    mutates: false,
    with: ALLOC,
    expect: each('400'),
    run: (w) => gridGet(w.P.id, 'from=2026-09-29&to=2026-11-23'),
  }),
  defineRow({
    id: 'GR-SPAN',
    spec: 'X65 — a window over 53 weeks (54: 2026-01-05 → 2027-01-18) is a 400 for everyone',
    action: 'GET /api/grid/project/[projectId]',
    mutates: false,
    with: ALLOC,
    expect: each('400'),
    // plan/m06 §7.2 lists to=2027-01-11, which is exactly 53 weeks (371 days, allowed); 2027-01-18 is the 54-week case.
    run: (w) => gridGet(w.P.id, 'from=2026-01-05&to=2027-01-18'),
  }),

  // ── saveAllocations (PERM-12, X27/X42/X65, M6-D3/D34) ──────────────────────────────────────────────────────────
  defineRow({
    id: 'AL-SAVE',
    spec: 'PERM-12 §3.2 วางแผน — pLeafLead WEEK 2026-11-16 = 200',
    action: 'saveAllocations',
    mutates: true,
    audit: auditAllocationP,
    with: ALLOC,
    expect: PROJ,
    run: async (w) => {
      const id = w.assignments.pLeafLead.id
      const r = await save({ items: [weekItem(id, '2026-11-16', 200)], clientOpId: 'op-al-save' })
      if (isOk(r)) {
        expect(r.results).toHaveLength(1)
        expect(r.results[0]).toMatchObject({
          taskAssignmentId: id,
          version: 2,
          weeks: { '2026-11-16': { cd: 200, resolution: 'WEEK' } },
        })
        expect(await allocationRows(id, '2026-11-16')).toEqual([
          { granularity: 'WEEK', periodStart: '2026-11-16', cd: 200 },
        ])
      }
      return r
    },
  }),
  defineRow({
    id: 'AL-CLEAR',
    spec: 'PERM-12 — pLeafLead WEEK 2026-09-28 = null deletes the stored 250',
    action: 'saveAllocations',
    mutates: true,
    audit: auditAllocationP,
    with: ALLOC,
    expect: PROJ,
    run: async (w) => {
      const id = w.assignments.pLeafLead.id
      const r = await save({ items: [weekItem(id, '2026-09-28', null)], clientOpId: 'op-al-clear' })
      if (isOk(r)) {
        expect(await allocationRows(id, '2026-09-28')).toEqual([])
        expect(await assignmentVersion(id)).toBe(2)
      }
      return r
    },
  }),
  defineRow({
    id: 'AL-COLLAPSE',
    spec: 'PERM-12 + X27 — pChildAMember WEEK 2026-10-12 = 150 on its DAY week with COLLAPSE',
    action: 'saveAllocations',
    mutates: true,
    audit: auditAllocationP,
    with: ALLOC,
    expect: PROJ,
    run: async (w) => {
      const id = w.assignments.pChildAMember.id
      const r = await save({
        items: [weekItem(id, '2026-10-12', 150)],
        onDayWeekConflict: 'COLLAPSE',
        clientOpId: 'op-al-collapse',
      })
      if (isOk(r)) {
        expect(await allocationRows(id, '2026-10-12')).toEqual([
          { granularity: 'WEEK', periodStart: '2026-10-12', cd: 150 },
        ])
      }
      return r
    },
  }),
  defineRow({
    id: 'AL-DAYWEEK',
    spec: 'PERM-12 + X27 / M6-D34 — WEEK change on a DAY week without a choice → 400 DAY_WEEK, nothing written',
    action: 'saveAllocations',
    mutates: false,
    with: ALLOC,
    expect: PROJ_400,
    setup: (w) => snapshot(w.assignments.pChildAMember.id, '2026-10-12'),
    run: async (w, before) => {
      const id = w.assignments.pChildAMember.id
      const r = await save({ items: [weekItem(id, '2026-10-12', 150)], clientOpId: 'op-al-dayweek' })
      if (!r.ok && r.code === 'VALIDATION') {
        expect(r.message).toBe(th.grid.errors.dayWeek)
        expect(r.issues).toEqual([{ taskAssignmentId: id, period: '2026-10-12', reason: 'DAY_WEEK' }])
      }
      await expectUnchanged(id, '2026-10-12', before)
      return r
    },
  }),
  defineRow({
    id: 'AL-STALE',
    spec: 'PERM-12 + §7.4 — baseVersion 99 → 409 VERSION_CONFLICT with `current` of the item only',
    action: 'saveAllocations',
    mutates: false,
    with: ALLOC,
    expect: PROJ_409,
    setup: (w) => snapshot(w.assignments.pLeafLead.id, '2026-10-05'),
    run: async (w, before) => {
      const id = w.assignments.pLeafLead.id
      const r = await save({ items: [weekItem(id, '2026-10-05', 100, 99)], clientOpId: 'op-al-stale' })
      if (!r.ok && r.code === 'VERSION_CONFLICT') {
        expect(r.current).toHaveLength(1)
        expect(r.current).toMatchObject([
          {
            taskAssignmentId: id,
            version: 1,
            weeks: { '2026-10-05': { cd: 500, resolution: 'WEEK' } },
            rowTotal: { total: 750, committed: 750 },
          },
        ])
      }
      await expectUnchanged(id, '2026-10-05', before)
      return r
    },
  }),
  defineRow({
    id: 'AL-ARCH',
    spec: 'PERM-12 + X42 — a plan write on archived A (aTaskMember WEEK 2026-10-12 = 100)',
    action: 'saveAllocations',
    mutates: false,
    with: ALLOC,
    expect: ARCH_WRITE,
    setup: (w) => snapshot(w.assignments.aTaskMember.id, '2026-10-12'),
    run: async (w, before) => {
      const id = w.assignments.aTaskMember.id
      const r = await save({ items: [weekItem(id, '2026-10-12', 100)], clientOpId: 'op-al-arch' })
      await expectUnchanged(id, '2026-10-12', before)
      return r
    },
  }),
  defineRow({
    id: 'AL-MIXED-ARCH',
    spec: 'PERM-12 + X42 — batch [pLeafLead, aTaskMember]: the archived item fails the whole batch',
    action: 'saveAllocations',
    mutates: false,
    with: ALLOC,
    expect: ARCH_WRITE,
    setup: (w) => snapshot(w.assignments.pLeafLead.id, '2026-11-16'),
    run: async (w, before) => {
      const r = await save({
        items: [
          weekItem(w.assignments.pLeafLead.id, '2026-11-16', 200),
          weekItem(w.assignments.aTaskMember.id, '2026-10-12', 100),
        ],
        clientOpId: 'op-al-mixed',
      })
      await expectUnchanged(w.assignments.pLeafLead.id, '2026-11-16', before)
      return r
    },
  }),
  defineRow({
    id: 'AL-MISSING',
    spec: 'X41 — an assignment id that does not exist is a 404 for everyone',
    action: 'saveAllocations',
    mutates: false,
    with: ALLOC,
    expect: each('404'),
    run: () => save({ items: [weekItem(randomUUID(), '2026-11-16', 200)], clientOpId: 'op-al-missing' }),
  }),
  defineRow({
    id: 'AL-BAD',
    spec: 'BR-26 / zod — a WEEK period that is not a Monday (2026-09-29) is a 400 for everyone',
    action: 'saveAllocations',
    mutates: false,
    with: ALLOC,
    expect: each('400'),
    setup: (w) => snapshot(w.assignments.pLeafLead.id, '2026-09-28'),
    run: async (w, before) => {
      const r = await save({
        items: [weekItem(w.assignments.pLeafLead.id, '2026-09-29', 200)],
        clientOpId: 'op-al-bad',
      })
      await expectUnchanged(w.assignments.pLeafLead.id, '2026-09-28', before)
      return r
    },
  }),

  // ── planAssignmentRange (PERM-12, FR-612, BR-25, M6-D6) ────────────────────────────────────────────────────────
  defineRow({
    id: 'PR-PREVIEW',
    spec: 'PERM-12 + FR-612 — dryRun pLeafLead 500 over 2026-11-16..11-20 previews, writes nothing',
    action: 'planAssignmentRange',
    mutates: false,
    with: ALLOC,
    expect: PROJ,
    setup: (w) => snapshot(w.assignments.pLeafLead.id, '2026-11-16'),
    run: async (w, before) => {
      const id = w.assignments.pLeafLead.id
      const r: ActionResult<PlanAssignmentRangeOk> = await planRange({
        taskAssignmentId: id,
        baseVersion: null,
        totalCd: 500,
        start: '2026-11-16',
        end: '2026-11-20',
        dryRun: true,
        clientOpId: 'op-pr-preview',
      })
      if (isOk(r)) {
        expect(r.applied).toBeNull()
        expect(r.preview).toMatchObject({ version: 1, totalCd: 500 })
        expect(r.preview.weeks).toMatchObject([
          { week: '2026-11-16', kind: 'WHOLE', after: { cd: 500, resolution: 'WEEK' } },
        ])
      }
      await expectUnchanged(id, '2026-11-16', before)
      return r
    },
  }),
  defineRow({
    id: 'PR-APPLY',
    spec: 'PERM-12 + FR-612 — apply (baseVersion 1) pLeafLead 500 over 2026-11-16..11-20 → one WEEK row',
    action: 'planAssignmentRange',
    mutates: true,
    audit: auditAllocationP,
    with: ALLOC,
    expect: PROJ,
    run: async (w) => {
      const id = w.assignments.pLeafLead.id
      const r = await planRange({
        taskAssignmentId: id,
        baseVersion: 1,
        totalCd: 500,
        start: '2026-11-16',
        end: '2026-11-20',
        dryRun: false,
        clientOpId: 'op-pr-apply',
      })
      if (isOk(r)) {
        expect(r.applied).toMatchObject({
          taskAssignmentId: id,
          version: 2,
          weeks: { '2026-11-16': { cd: 500, resolution: 'WEEK' } },
        })
        expect(await allocationRows(id, '2026-11-16')).toEqual([
          { granularity: 'WEEK', periodStart: '2026-11-16', cd: 500 },
        ])
      }
      return r
    },
  }),
  defineRow({
    id: 'PR-UNREP',
    spec: 'PERM-12 + M6-D6 — 400 cd over 3 days (2026-11-11..11-13) cannot be represented → 400 UNREPRESENTABLE',
    action: 'planAssignmentRange',
    mutates: false,
    with: ALLOC,
    expect: PROJ_400,
    setup: (w) => snapshot(w.assignments.pLeafLead.id, '2026-11-09'),
    run: async (w, before) => {
      const id = w.assignments.pLeafLead.id
      const r = await planRange({
        taskAssignmentId: id,
        baseVersion: 1,
        totalCd: 400,
        start: '2026-11-11',
        end: '2026-11-13',
        dryRun: false,
        clientOpId: 'op-pr-unrep',
      })
      if (!r.ok && r.code === 'VALIDATION') {
        expect(r.issues).toMatchObject([{ taskAssignmentId: id, period: '2026-11-09', reason: 'UNREPRESENTABLE' }])
      }
      await expectUnchanged(id, '2026-11-09', before)
      return r
    },
  }),
  defineRow({
    id: 'PR-ARCH',
    spec: 'PERM-12 + X42 — even a dryRun on archived A (aTaskMember) is 403',
    action: 'planAssignmentRange',
    mutates: false,
    with: ALLOC,
    expect: ARCH_WRITE,
    run: (w) =>
      planRange({
        taskAssignmentId: w.assignments.aTaskMember.id,
        baseVersion: null,
        totalCd: 300,
        start: '2026-10-12',
        end: '2026-10-16',
        dryRun: true,
        clientOpId: 'op-pr-arch',
      }),
  }),
  // Beyond plan §7.2 (same rules, cheap): stale apply, unknown id, invalid range.
  defineRow({
    id: 'PR-STALE',
    spec: 'PERM-12 + §7.4 — apply with baseVersion 99 → 409 VERSION_CONFLICT, nothing written',
    action: 'planAssignmentRange',
    mutates: false,
    with: ALLOC,
    expect: PROJ_409,
    setup: (w) => snapshot(w.assignments.pLeafLead.id, '2026-11-16'),
    run: async (w, before) => {
      const id = w.assignments.pLeafLead.id
      const r = await planRange({
        taskAssignmentId: id,
        baseVersion: 99,
        totalCd: 500,
        start: '2026-11-16',
        end: '2026-11-20',
        dryRun: false,
        clientOpId: 'op-pr-stale',
      })
      await expectUnchanged(id, '2026-11-16', before)
      return r
    },
  }),
  defineRow({
    id: 'PR-MISSING',
    spec: 'X41 — planAssignmentRange on an assignment id that does not exist is a 404 for everyone',
    action: 'planAssignmentRange',
    mutates: false,
    with: ALLOC,
    expect: each('404'),
    run: () =>
      planRange({
        taskAssignmentId: randomUUID(),
        baseVersion: null,
        totalCd: 500,
        start: '2026-11-16',
        end: '2026-11-20',
        dryRun: true,
        clientOpId: 'op-pr-missing',
      }),
  }),
  defineRow({
    id: 'PR-BAD',
    spec: 'zod — end before start is a 400 for everyone',
    action: 'planAssignmentRange',
    mutates: false,
    with: ALLOC,
    expect: each('400'),
    run: (w) =>
      planRange({
        taskAssignmentId: w.assignments.pLeafLead.id,
        baseVersion: null,
        totalCd: 500,
        start: '2026-11-20',
        end: '2026-11-16',
        dryRun: true,
        clientOpId: 'op-pr-bad',
      }),
  }),
]
