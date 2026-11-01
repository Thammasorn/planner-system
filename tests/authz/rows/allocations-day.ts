// tests/authz/rows/allocations-day.ts — M7 PERM-12 (วางแผน) rows on day resolution: BR-22 split, DAY edits, BR-24
// NEEDS_CHOICE / SCALE / COLLAPSE (= BR-23, M7-D2), clear, MIXED_WEEK_AND_DAY, BR-26 DAY limit, hidden items, archived A
// (SPEC §3.2, §5.3, §7.4; X41/X42/X44/X65; plan/m07 S4.1, §7.2). Written from the SPEC before S2 completes the save
// service's per-week table (PLAN §4.1): red until S2 (and until S0's NEEDS_CHOICE error code lands).
// Allowed writes assert the stored rows; refused ones assert in `run` that rows, version and audit_log are unchanged
// (`run` also executes in the nobody / mustChangePassword loops, where nothing may be written either).
import { expect } from 'vitest'
import { ALLOCATION_AUDIT_ENTITY } from '@/server/services/allocations'
import { allocationRows } from '../../helpers/factories'
import type { World } from '../../helpers/world'
import { defineRow, type AuthzRow } from '../types'
import {
  ARCH,
  BAD,
  day,
  DAY_WORLD,
  daySnapshot,
  expectDayUnchanged,
  isOk,
  needsChoiceOf,
  saveDay,
  sumCd,
  VIEW,
  VIEW_400,
  VIEW_409,
  week,
} from './_m7'

const ACTION = 'saveAllocations'
/** X44: one `allocation` audit row per changed assignment, project_id = P. */
const AUDIT = { entity: ALLOCATION_AUDIT_ENTITY, projectId: (w: World) => w.P.id } as const

export const rows: AuthzRow[] = [
  defineRow({
    id: 'AL-D-SPLIT',
    spec: 'PERM-12 §3.2 วางแผน + BR-22 — DAY 2026-11-04 = 100 on the pWeek WEEK 250 week → DAY rows, total 300',
    action: ACTION,
    mutates: true,
    audit: AUDIT,
    with: DAY_WORLD,
    expect: VIEW,
    run: async (w) => {
      const id = w.assignments.pLeafLead.id
      const r = await saveDay([{ id, changes: [day('2026-11-04', 100)] }], undefined, 'authz-m7-split')
      if (isOk(r)) {
        // BR-22: spread 50 × 5 (BR-21), apply Wed = 100, DELETE WEEK → INSERT DAY; new total = 250 − 50 + 100
        expect(await allocationRows(id, '2026-11-02')).toEqual([
          { granularity: 'DAY', periodStart: '2026-11-02', cd: 50 },
          { granularity: 'DAY', periodStart: '2026-11-03', cd: 50 },
          { granularity: 'DAY', periodStart: '2026-11-04', cd: 100 },
          { granularity: 'DAY', periodStart: '2026-11-05', cd: 50 },
          { granularity: 'DAY', periodStart: '2026-11-06', cd: 50 },
        ])
        expect(r.results).toMatchObject([
          { taskAssignmentId: id, version: 2, weeks: { '2026-11-02': { cd: 300, resolution: 'DAY' } } },
        ])
      }
      return r
    },
  }),
  defineRow({
    id: 'AL-D-SET',
    spec: 'PERM-12 + BR-20a — DAY 2026-11-11 = 25 on the pDay DAY week → week total 225',
    action: ACTION,
    mutates: true,
    audit: AUDIT,
    with: DAY_WORLD,
    expect: VIEW,
    run: async (w) => {
      const id = w.assignments.pLeafLead.id
      const r = await saveDay([{ id, changes: [day('2026-11-11', 25)] }], undefined, 'authz-m7-set')
      if (isOk(r)) {
        expect(await allocationRows(id, '2026-11-09')).toEqual([
          { granularity: 'DAY', periodStart: '2026-11-09', cd: 100 },
          { granularity: 'DAY', periodStart: '2026-11-10', cd: 100 },
          { granularity: 'DAY', periodStart: '2026-11-11', cd: 25 },
        ])
        expect(r.results[0]?.weeks['2026-11-09']).toMatchObject({ cd: 225, resolution: 'DAY' })
      }
      return r
    },
  }),
  defineRow({
    id: 'AL-D-NEEDS',
    spec: 'PERM-12 + BR-24 / §7.4 — WEEK 2026-11-09 = 400 on the DAY week without a choice → 409 NEEDS_CHOICE, nothing written',
    action: ACTION,
    mutates: false,
    with: DAY_WORLD,
    expect: VIEW_409,
    setup: (w) => daySnapshot(w.assignments.pLeafLead.id, '2026-11-09'),
    run: async (w, before) => {
      const id = w.assignments.pLeafLead.id
      const r = await saveDay([{ id, changes: [week('2026-11-09', 400)] }], undefined, 'authz-m7-needs')
      if (!r.ok && r.code !== 'NOT_FOUND' && r.code !== 'UNAUTHENTICATED' && r.code !== 'MUST_CHANGE_PASSWORD') {
        expect(needsChoiceOf(r)).toEqual({
          week: '2026-11-09',
          weeks: ['2026-11-09'],
          pairs: [{ taskAssignmentId: id, week: '2026-11-09' }],
        })
      }
      // M7-D3: no write, no version bump, no audit row
      await expectDayUnchanged(id, '2026-11-09', before)
      return r
    },
  }),
  defineRow({
    id: 'AL-D-SCALE',
    spec: 'PERM-12 + BR-24 ปรับตามสัดส่วนเดิม — WEEK 2026-11-09 = 400 + SCALE → DAY rows, Σ = 400, every day ≤ 100 (M7-D7)',
    action: ACTION,
    mutates: true,
    audit: AUDIT,
    with: DAY_WORLD,
    expect: VIEW,
    run: async (w) => {
      const id = w.assignments.pLeafLead.id
      const r = await saveDay([{ id, changes: [week('2026-11-09', 400)] }], 'SCALE', 'authz-m7-scale')
      if (isOk(r)) {
        const stored = await allocationRows(id, '2026-11-09')
        expect(stored.every((x) => x.granularity === 'DAY' && x.cd > 0 && x.cd <= 100), JSON.stringify(stored)).toBe(
          true,
        )
        expect(sumCd(stored)).toBe(400)
        expect(r.results[0]?.weeks['2026-11-09']).toMatchObject({ cd: 400, resolution: 'DAY' })
      }
      return r
    },
  }),
  defineRow({
    id: 'AL-D-COLLAPSE',
    spec: 'PERM-12 + BR-23 / BR-24 เปลี่ยนเป็นรายสัปดาห์ — WEEK 2026-11-09 = 250 (= Σ days) + COLLAPSE → one WEEK row (M7-D2)',
    action: ACTION,
    mutates: true,
    audit: AUDIT,
    with: DAY_WORLD,
    expect: VIEW,
    run: async (w) => {
      const id = w.assignments.pLeafLead.id
      const r = await saveDay([{ id, changes: [week('2026-11-09', 250)] }], 'COLLAPSE', 'authz-m7-collapse')
      if (isOk(r)) {
        expect(await allocationRows(id, '2026-11-09')).toEqual([
          { granularity: 'WEEK', periodStart: '2026-11-09', cd: 250 },
        ])
        expect(r.results[0]?.weeks['2026-11-09']).toMatchObject({ cd: 250, resolution: 'WEEK' })
      }
      return r
    },
  }),
  defineRow({
    id: 'AL-D-CLEAR',
    spec: 'PERM-12 + M7-D5 — WEEK 2026-11-09 = null on the DAY week deletes every row of the week (no dialog)',
    action: ACTION,
    mutates: true,
    audit: AUDIT,
    with: DAY_WORLD,
    expect: VIEW,
    run: async (w) => {
      const id = w.assignments.pLeafLead.id
      const r = await saveDay([{ id, changes: [week('2026-11-09', null)] }], undefined, 'authz-m7-clear')
      if (isOk(r)) expect(await allocationRows(id, '2026-11-09')).toEqual([])
      return r
    },
  }),
  defineRow({
    id: 'AL-D-MIXED',
    spec: 'PERM-12 + M7-D6 — WEEK 2026-11-09 = 300 and DAY 2026-11-10 = 50 in one item → 400 MIXED_WEEK_AND_DAY (after authz)',
    action: ACTION,
    mutates: false,
    with: DAY_WORLD,
    expect: VIEW_400,
    setup: (w) => daySnapshot(w.assignments.pLeafLead.id, '2026-11-09'),
    run: async (w, before) => {
      const id = w.assignments.pLeafLead.id
      const r = await saveDay(
        [{ id, changes: [week('2026-11-09', 300), day('2026-11-10', 50)] }],
        undefined,
        'authz-m7-mixed',
      )
      if (!r.ok && r.code === 'VALIDATION')
        expect(r.issues).toEqual([{ taskAssignmentId: id, period: '2026-11-09', reason: 'MIXED_WEEK_AND_DAY' }])
      await expectDayUnchanged(id, '2026-11-09', before)
      return r
    },
  }),
  defineRow({
    id: 'AL-D-MAX',
    spec: 'PERM-12 + BR-26 — DAY 2026-11-04 = 125 cd (> 1.00/day) is a 400 for everyone (zod precedes authz)',
    action: ACTION,
    mutates: false,
    with: DAY_WORLD,
    expect: BAD,
    setup: (w) => daySnapshot(w.assignments.pLeafLead.id, '2026-11-02'),
    run: async (w, before) => {
      const id = w.assignments.pLeafLead.id
      const r = await saveDay([{ id, changes: [day('2026-11-04', 125)] }], undefined, 'authz-m7-max')
      await expectDayUnchanged(id, '2026-11-02', before)
      return r
    },
  }),
  defineRow({
    id: 'AL-D-HIDDEN',
    spec: 'PERM-12 + X65 — batch [pLeafLead DAY 11-04 = 50, qTaskCoworker DAY 11-10 = 25]: Q is invisible to L/Me → 404 all-or-nothing; M writes both',
    action: ACTION,
    mutates: true,
    audit: {
      entity: ALLOCATION_AUDIT_ENTITY,
      count: 2,
      projectIds: (w: World) => [w.P.id, w.Q.id],
    },
    with: DAY_WORLD,
    expect: { M: 'allow', L: '404', Me: '404', W: '404' },
    setup: (w) => daySnapshot(w.assignments.pLeafLead.id, '2026-11-02'),
    run: async (w, before) => {
      const p = w.assignments.pLeafLead.id
      const q = w.assignments.qTaskCoworker.id
      const r = await saveDay(
        [
          { id: p, changes: [day('2026-11-04', 50)] },
          { id: q, changes: [day('2026-11-10', 25)] },
        ],
        undefined,
        'authz-m7-hidden',
      )
      if (isOk(r)) {
        expect(r.results.map((x) => x.taskAssignmentId).sort()).toEqual([p, q].sort())
        expect(await allocationRows(q, '2026-11-09')).toEqual([
          { granularity: 'DAY', periodStart: '2026-11-10', cd: 25 },
        ])
        // BR-22 on pWeek: 50 × 5 derived, Wed = 50 → unchanged total 250, but the week is now DAY (M7-D8)
        const stored = await allocationRows(p, '2026-11-02')
        expect(stored.every((x) => x.granularity === 'DAY')).toBe(true)
        expect(sumCd(stored)).toBe(250)
      } else {
        await expectDayUnchanged(p, '2026-11-02', before)
      }
      return r
    },
  }),
  defineRow({
    id: 'AL-D-ARCH',
    spec: 'PERM-12 + X42 — DAY 2026-11-09 = 25 on aTaskMember (archived A) → 403 for the team, 404 for W',
    action: ACTION,
    mutates: false,
    with: DAY_WORLD,
    expect: ARCH,
    setup: (w) => daySnapshot(w.assignments.aTaskMember.id, '2026-11-09'),
    run: async (w, before) => {
      const id = w.assignments.aTaskMember.id
      const r = await saveDay([{ id, changes: [day('2026-11-09', 25)] }], undefined, 'authz-m7-arch')
      await expectDayUnchanged(id, '2026-11-09', before)
      return r
    },
  }),
  defineRow({
    id: 'AL-D-ARCH-COLLAPSE',
    spec: 'PERM-12 + X42 — WEEK 2026-11-09 = 50 + COLLAPSE on aTaskMember (archived A) → 403 for the team, 404 for W',
    action: ACTION,
    mutates: false,
    with: DAY_WORLD,
    expect: ARCH,
    setup: (w) => daySnapshot(w.assignments.aTaskMember.id, '2026-11-09'),
    run: async (w, before) => {
      const id = w.assignments.aTaskMember.id
      const r = await saveDay([{ id, changes: [week('2026-11-09', 50)] }], 'COLLAPSE', 'authz-m7-arch-collapse')
      await expectDayUnchanged(id, '2026-11-09', before)
      return r
    },
  }),
]
