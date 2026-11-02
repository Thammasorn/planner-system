// tests/authz/rows/people.ts — M9 PERM-22 rows of the people views (SPEC §3.2 "ดู workload → §3.3", FR-1008):
// the ทีมงาน directory, the person grid chunk (SPEC §7.4), the /people/[id] header loader and the วันลา tab route.
// Written from SPEC §3.2/§3.3 before the services exist (PLAN §4.1; plan/m09 S5.1, §7.2). A person the viewer may not
// see — and an unknown or malformed id — is a 404 (X41/X86, requireVisibleUser). The person grid uses M6's query
// schema (bad range → 400 before authz). Row ids use PGRID- (not the plan's PG-): the M4 meta test reserves /^PG-/
// for page rows that need the pages world.
import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import type { GridResponse } from '@/lib/contracts/grid'
import type { PeopleDirectoryResponse, PersonTimeOffResponse } from '@/lib/contracts/workload'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import type { World } from '../../helpers/world'
import { loaderOutcome } from '../_support/loader'
import { defineRow, type AuthzRow } from '../types'
import {
  ALL,
  check,
  each,
  M9_THIS_WEEK,
  M9_WORLD,
  NOT_ME,
  NOT_W,
  PEOPLE_ROUTE,
  peopleGet,
  PERSON_GRID_RANGE,
  PERSON_GRID_ROUTE,
  PERSON_HEADER_LOADER,
  PERSON_TIME_OFF_ROUTE,
  personGridGet,
  personTimeOffGet,
} from './_m9'

/** A 200 person-grid chunk is about that person, never editable structure (M9-D12/D29). */
const personChunk = (w: World, pick: (w: World) => { id: string }) => async (res: Response) =>
  check<GridResponse>(res, (b) => {
    expect(b.context).toMatchObject({ kind: 'person', id: pick(w).id, canManage: false })
    expect(b.window).toMatchObject({ from: '2026-09-28', to: '2026-11-23' })
    expect(b.periods).toHaveLength(8)
    expect(Object.keys(b.people)).toEqual([pick(w).id])
  })

export const rows: AuthzRow[] = [
  // ── GET /api/people (FR-1008 directory, M9-D14) ─────────────────────────────────────────────────────────────
  defineRow({
    id: 'PEOPLE',
    spec: 'PERM-22 §3.3 — GET /api/people (every role; the list holds only people the viewer may see)',
    action: PEOPLE_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: ALL,
    run: async () =>
      check<PeopleDirectoryResponse>(await peopleGet(), (b) => {
        expect(b.week).toBe(M9_THIS_WEEK)
      }),
  }),

  // ── GET /api/grid/person/[userId] (SPEC §7.4, M9-D12) ───────────────────────────────────────────────────────
  defineRow({
    id: 'PGRID-ME',
    spec: 'PERM-22 §3.3 — the member’s person grid (W shares no project → 404)',
    action: PERSON_GRID_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: NOT_W,
    run: async (w) => personChunk(w, (x) => x.member)(await personGridGet(w.member.id, PERSON_GRID_RANGE)),
  }),
  defineRow({
    id: 'PGRID-W',
    spec: 'PERM-22 §3.3 — the outsider’s person grid (Me shares no project → 404)',
    action: PERSON_GRID_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: NOT_ME,
    run: async (w) => personChunk(w, (x) => x.outsider)(await personGridGet(w.outsider.id, PERSON_GRID_RANGE)),
  }),
  defineRow({
    id: 'PGRID-CO',
    spec: 'PERM-22 §3.3 — the coworker (P and Q) is visible to every role',
    action: PERSON_GRID_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: ALL,
    run: async (w) =>
      personChunk(w, (x) => x.users.coworker!)(await personGridGet(w.users.coworker!.id, PERSON_GRID_RANGE)),
  }),
  defineRow({
    id: 'PGRID-DEFAULT',
    spec: 'PERM-22 + X65 — no from/to → default window −4/+12 weeks around today (2026-09-30)',
    action: PERSON_GRID_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: ALL,
    run: async (w) =>
      check<GridResponse>(await personGridGet(w.users.coworker!.id), (b) => {
        expect(b.window).toMatchObject({ from: '2026-08-31', to: '2026-12-21' })
        expect(b.periods).toHaveLength(16)
      }),
  }),
  defineRow({
    id: 'PGRID-MISSING',
    spec: 'X86 — an unknown user id is a 404 for everyone',
    action: PERSON_GRID_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: each('404'),
    run: () => personGridGet(randomUUID(), PERSON_GRID_RANGE),
  }),
  defineRow({
    id: 'PGRID-BADID',
    spec: 'X86 — a malformed user id is a 404 (not a 400) for everyone',
    action: PERSON_GRID_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: each('404'),
    run: () => personGridGet('x'.repeat(65), PERSON_GRID_RANGE),
  }),
  defineRow({
    id: 'PGRID-BADQ',
    spec: 'X41 — from is not a Monday → 400 for everyone (parse before authz)',
    action: PERSON_GRID_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: each('400'),
    run: (w) => personGridGet(w.member.id, 'from=2026-09-29&to=2026-11-23'),
  }),

  // ── /people/[id] header (page loader, M9-D14, X57) ──────────────────────────────────────────────────────────
  defineRow({
    id: 'PH-ME',
    spec: 'PERM-22 FR-1008 — person header loader for the member (W → 404)',
    action: PERSON_HEADER_LOADER,
    mutates: false,
    with: M9_WORLD,
    expect: NOT_W,
    run: (w) => loaderOutcome((user) => services.people.getPersonHeader(db, user, w.member.id)),
  }),
  defineRow({
    id: 'PH-W',
    spec: 'PERM-22 FR-1008 — person header loader for the outsider (Me → 404)',
    action: PERSON_HEADER_LOADER,
    mutates: false,
    with: M9_WORLD,
    expect: NOT_ME,
    run: (w) => loaderOutcome((user) => services.people.getPersonHeader(db, user, w.outsider.id)),
  }),
  defineRow({
    id: 'PH-MISSING',
    spec: 'X86 — the header of an unknown user id is a 404 for everyone',
    action: PERSON_HEADER_LOADER,
    mutates: false,
    with: M9_WORLD,
    expect: each('404'),
    run: () => loaderOutcome((user) => services.people.getPersonHeader(db, user, randomUUID())),
  }),

  // ── GET /api/people/[userId]/time-off (FR-1008 วันลา, M9-D16, MASK-5) ───────────────────────────────────────
  defineRow({
    id: 'PT-ME',
    spec: 'PERM-22 FR-1008 วันลา — the member’s leave (W → 404)',
    action: PERSON_TIME_OFF_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: NOT_W,
    run: async (w) =>
      check<PersonTimeOffResponse>(await personTimeOffGet(w.member.id), (b) => {
        // M9-D16 window [weekStart(today) − 52 w, + 53 w)
        expect(b).toMatchObject({ from: '2025-09-29', to: '2027-10-04' })
      }),
  }),
  defineRow({
    id: 'PT-W',
    spec: 'PERM-22 FR-1008 วันลา — the outsider’s leave (Me → 404)',
    action: PERSON_TIME_OFF_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: NOT_ME,
    run: (w) => personTimeOffGet(w.outsider.id),
  }),
  defineRow({
    id: 'PT-MISSING',
    spec: 'X86 — the leave of an unknown user id is a 404 for everyone',
    action: PERSON_TIME_OFF_ROUTE,
    mutates: false,
    with: M9_WORLD,
    expect: each('404'),
    run: () => personTimeOffGet(randomUUID()),
  }),
]
