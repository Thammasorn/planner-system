// tests/authz/rows/workload.ts — M9 PERM-22 (ดู workload, SPEC §3.2 → §3.3), PERM-06 (project filter / project load),
// PERM-04 (client load) and PERM-12 (a person-grid edit goes through saveAllocations) rows, written from SPEC
// §3.2/§3.3 before the M9 services exist (PLAN §4.1; plan/m09 S5.1, §7.2). World createWorld({ with: ['allocations',
// 'milestones'] }). Body leaks are the masking suite's job (masking.int.test.ts › workload & people (M9)); the checks
// here only pin the shape the row asked for. Bad queries → 400 for everyone (parse before authz, X41); a filter or
// target the viewer may not see → 404 (M9-D5, X86).
import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import type {
  ClientLoadResponse,
  ProjectLoadResponse,
  WorkloadBadgeResponse,
  WorkloadCellDetail,
  WorkloadResponse,
} from '@/lib/contracts/workload'
import { defineRow, type AuthzRow } from '../types'
import { auditAllocationP, save, weekItem } from './_m6'
import {
  ALL,
  check,
  CLIENT_LOAD_ROUTE,
  clientLoadGet,
  each,
  M9_THIS_WEEK,
  M9_TODAY,
  M9_WORLD,
  NOT_ME,
  NOT_W,
  PROJECT_LOAD_ROUTE,
  projectLoadGet,
  Q_ONLY,
  WORKLOAD_BADGE_ROUTE,
  WORKLOAD_CELL_ROUTE,
  WORKLOAD_RANGE,
  WORKLOAD_ROUTE,
  workloadBadgeGet,
  workloadCellGet,
  workloadGet,
} from './_m9'

/** The 12 Mondays of [2026-09-28, 2026-12-21). */
const TWELVE_WEEKS = [
  '2026-09-28',
  '2026-10-05',
  '2026-10-12',
  '2026-10-19',
  '2026-10-26',
  '2026-11-02',
  '2026-11-09',
  '2026-11-16',
  '2026-11-23',
  '2026-11-30',
  '2026-12-07',
  '2026-12-14',
]

/** Every person row carries a cell for every week of the window (M9-D2, empty weeks included). */
function expectFullTable(b: WorkloadResponse, weeks: readonly string[]): void {
  expect(b.weeks).toEqual(weeks)
  expect(b.today).toBe(M9_TODAY)
  for (const g of b.groups) for (const p of g.people) expect(Object.keys(p.cells).sort(), p.name).toEqual([...weeks])
}

const peopleOf = (b: WorkloadResponse): string[] => b.groups.flatMap((g) => g.people.map((p) => p.userId)).sort()

export const rows: AuthzRow[] = [
  // ── GET /api/workload (PERM-22 → §3.3; M9-D2…D5) ─────────────────────────────────────────────────────────────
  defineRow({
    id: 'WL-TABLE',
    spec: 'PERM-22 §3.2 ดู workload → §3.3 — GET /api/workload (12-week window)',
    action: WORKLOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: ALL,
    run: async () =>
      check<WorkloadResponse>(await workloadGet(WORKLOAD_RANGE), (b) => {
        expect(b).toMatchObject({ from: '2026-09-28', to: '2026-12-21' })
        expectFullTable(b, TWELVE_WEEKS)
      }),
  }),
  defineRow({
    id: 'WL-DEFAULT',
    spec: 'PERM-22 + M9-D4 — no from/to → [weekStart(today), +12 w) around 2026-09-30',
    action: WORKLOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: ALL,
    run: async () =>
      check<WorkloadResponse>(await workloadGet(), (b) => {
        expect(b).toMatchObject({ from: M9_THIS_WEEK, to: '2026-12-21' })
        expectFullTable(b, TWELVE_WEEKS)
      }),
  }),
  defineRow({
    id: 'WL-PROJ-P',
    spec: 'PERM-06 + M9-D5 — projectId filter of P (W cannot see P → 404)',
    action: WORKLOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: NOT_W,
    run: async (w) =>
      check<WorkloadResponse>(await workloadGet(`projectId=${w.P.id}`), (b) => {
        // members of P ∪ load in P within the window — the outsider is neither
        expect(peopleOf(b)).not.toContain(w.outsider.id)
        expect(peopleOf(b)).toContain(w.users.coworker!.id)
      }),
  }),
  defineRow({
    id: 'WL-PROJ-Q',
    spec: 'PERM-06 + M9-D5 — projectId filter of Q (lead and member are not in Q → 404)',
    action: WORKLOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: Q_ONLY,
    run: async (w) =>
      check<WorkloadResponse>(await workloadGet(`projectId=${w.Q.id}`), (b) => {
        expect(peopleOf(b)).toEqual([w.outsider.id, w.users.coworker!.id].sort())
      }),
  }),
  defineRow({
    id: 'WL-PROJ-MISSING',
    spec: 'X41 — a projectId that does not exist is a 404 for everyone (M9-D5)',
    action: WORKLOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: each('404'),
    run: () => workloadGet(`projectId=${randomUUID()}`),
  }),
  defineRow({
    id: 'WL-BADQ',
    spec: 'X41 — from is not a Monday → 400 for everyone (parse before authz)',
    action: WORKLOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: each('400'),
    run: () => workloadGet('from=2026-09-29&to=2026-12-21'),
  }),
  defineRow({
    id: 'WL-SPAN',
    spec: 'M9-D4 — a window over 53 weeks (54: 2026-01-05 → 2027-01-18) is a 400 for everyone',
    action: WORKLOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: each('400'),
    // plan/m09 §7.2 lists to=2027-01-11, which is exactly 53 weeks (allowed, same slip as M6's GR-SPAN)
    run: () => workloadGet('from=2026-01-05&to=2027-01-18'),
  }),

  // ── GET /api/workload/cell (PERM-22 → §3.3 "เห็นยอดรวมของใคร"; M9-D9) ────────────────────────────────────────
  defineRow({
    id: 'WL-CELL-ME',
    spec: 'PERM-22 §3.3 — the member’s cell: everyone who shares a project with her (W does not → 404)',
    action: WORKLOAD_CELL_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: NOT_W,
    run: async (w) =>
      check<WorkloadCellDetail>(await workloadCellGet(w.member.id, '2026-10-05'), (b) => {
        expect(b).toMatchObject({ userId: w.member.id, week: '2026-10-05' })
      }),
  }),
  defineRow({
    id: 'WL-CELL-W',
    spec: 'PERM-22 §3.3 — the outsider’s cell: totals of co-members only (Me shares no project → 404)',
    action: WORKLOAD_CELL_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: NOT_ME,
    run: async (w) =>
      check<WorkloadCellDetail>(await workloadCellGet(w.outsider.id, '2026-10-05'), (b) => {
        expect(b).toMatchObject({ userId: w.outsider.id, week: '2026-10-05' })
      }),
  }),
  defineRow({
    id: 'WL-CELL-CO',
    spec: 'PERM-22 §3.3 — the coworker (in P and Q) is visible to every role',
    action: WORKLOAD_CELL_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: ALL,
    run: (w) => workloadCellGet(w.users.coworker!.id, '2026-10-05'),
  }),
  defineRow({
    id: 'WL-CELL-MISSING',
    spec: 'X86 — an unknown user id is a 404 for everyone (never reveals existence)',
    action: WORKLOAD_CELL_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: each('404'),
    run: () => workloadCellGet(randomUUID(), '2026-10-05'),
  }),
  defineRow({
    id: 'WL-CELL-BADQ',
    spec: 'X41 — week is not a Monday → 400 for everyone',
    action: WORKLOAD_CELL_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: each('400'),
    run: (w) => workloadCellGet(w.member.id, '2026-10-06'),
  }),

  // ── GET /api/workload/badge (PERM-22; FR-1007, M9-D11) ───────────────────────────────────────────────────────
  defineRow({
    id: 'WL-BADGE',
    spec: 'PERM-22 + FR-1007 — GET /api/workload/badge (every role; OVER cells of visible people, 4 weeks)',
    action: WORKLOAD_BADGE_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: ALL,
    run: async () =>
      check<WorkloadBadgeResponse>(await workloadBadgeGet(), (b) => {
        expect(Object.keys(b).sort()).toEqual(['from', 'overCount', 'to'])
        expect(b).toMatchObject({ from: M9_THIS_WEEK, to: '2026-10-26' })
        expect(Number.isInteger(b.overCount)).toBe(true)
      }),
  }),

  // ── GET /api/projects/[id]/load (PERM-06; FR-409, M9-D19, X42) ───────────────────────────────────────────────
  defineRow({
    id: 'PJ-LOAD',
    spec: 'PERM-06 §3.2 เปิดโปรเจค — GET /api/projects/{P}/load',
    action: PROJECT_LOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: NOT_W,
    run: async (w) =>
      check<ProjectLoadResponse>(await projectLoadGet(w.P.id), (b) => {
        expect(b).toMatchObject({ projectId: w.P.id, archived: false })
        expect(b.weeks).toEqual(TWELVE_WEEKS)
      }),
  }),
  defineRow({
    id: 'PJ-LOAD-ARCH',
    spec: 'PERM-06 + X42 — archived A stays readable: archived true, no load counted (BR-44)',
    action: PROJECT_LOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: NOT_W,
    run: async (w) =>
      check<ProjectLoadResponse>(await projectLoadGet(w.A.id), (b) => {
        expect(b).toMatchObject({ projectId: w.A.id, archived: true, sum: { total: 0, committed: 0 } })
      }),
  }),
  defineRow({
    id: 'PJ-LOAD-MISSING',
    spec: 'X41 — a project id that does not exist is a 404 for everyone',
    action: PROJECT_LOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: each('404'),
    run: () => projectLoadGet(randomUUID()),
  }),
  defineRow({
    id: 'PJ-LOAD-BADID',
    spec: 'X86 — a malformed project id is a 404 (not a 400) for everyone',
    action: PROJECT_LOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: each('404'),
    run: () => projectLoadGet('not-a-uuid'),
  }),

  // ── GET /api/clients/[id]/load (PERM-04 ดูลูกค้า; FR-303, M9-D20) ─────────────────────────────────────────────
  defineRow({
    id: 'CL-LOAD-C1',
    spec: 'PERM-04 §3.2 ดูลูกค้า — C1 (P, A): M all, L/Me clients of their projects, W 404',
    action: CLIENT_LOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: NOT_W,
    run: async (w) =>
      check<ClientLoadResponse>(await clientLoadGet(w.C1.id), (b) => {
        expect(b.clientId).toBe(w.C1.id)
        // archived A is never summed (M9-D20, BR-44)
        expect(b.projects.map((p) => p.projectId)).not.toContain(w.A.id)
      }),
  }),
  defineRow({
    id: 'CL-LOAD-C2',
    spec: 'PERM-04 §3.2 ดูลูกค้า — C2 (Q): only the manager and Q’s member',
    action: CLIENT_LOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: Q_ONLY,
    run: (w) => clientLoadGet(w.C2.id),
  }),
  defineRow({
    id: 'CL-LOAD-MISSING',
    spec: 'X41 — a client id that does not exist is a 404 for everyone',
    action: CLIENT_LOAD_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: each('404'),
    run: () => clientLoadGet(randomUUID()),
  }),

  // ── saveAllocations from the person grid (PERM-12; M9-D28 — same action, same audit) ────────────────────────
  defineRow({
    id: 'AL-PERSON',
    spec: 'PERM-12 §3.2 วางแผน — a person-grid edit: coworker’s P cell WEEK 2026-11-16 = 1.00 (X44 one allocation row of P)',
    action: 'saveAllocations',
    mutates: true,
    audit: auditAllocationP,
    with: M9_WORLD,
    expect: NOT_W,
    run: (w) =>
      save({ items: [weekItem(w.assignments.pCoworker.id, '2026-11-16', 100)], clientOpId: 'op-m9-person' }),
  }),
]
