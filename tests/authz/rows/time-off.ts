// tests/authz/rows/time-off.ts — M5 PERM-20a…20e / PERM-21a…21g (FR-903…909, M5-D3) — leave actions.
// SPEC §3.2: "บันทึก/แก้/ลบวันลาของตัวเอง" every role; "…ของคนอื่น" manager only. M5-D3 refines the worker answer:
// 404 when the target person is invisible to the actor (or does not exist), otherwise 403. plan/m05 S4.2, §7.2.
// World (plan/m05 S0.15): coworker = MEMBER of P and Q (visible to every role), pOnly = MEMBER of P only (invisible to
// the outsider). Own-leave dates (2026-12-…) never touch the world's entries (November), so overlap never interferes.
import { randomUUID } from 'node:crypto'
import { createTimeOff, deleteTimeOff, restoreTimeOff, updateTimeOff } from '@/server/actions/time-off'
import { makeTimeOff } from '../../helpers/factories'
import { defineRow, type AuthzRow } from '../types'
import { ALL, auditTimeOff, each, OTHERS, OTHERS_P, TIME_OFF } from './_m5'

export const rows: AuthzRow[] = [
  // ── PERM-20 own leave (every role) ──────────────────────────────────────────────────────────────────────────
  defineRow({
    id: 'PERM-20a',
    spec: '§3.2 บันทึกวันลาของตัวเอง (FR-903, userId omitted = self)',
    action: 'createTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: ALL,
    run: (w) =>
      createTimeOff({
        leaveTypeId: w.leaveTypes.vacation.id,
        startDate: '2026-12-07',
        endDate: '2026-12-08',
      }),
  }),
  defineRow({
    id: 'PERM-20b',
    spec: '§3.2 แก้วันลาของตัวเอง (FR-903: type, half day, note)',
    action: 'updateTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: ALL,
    setup: (w, actor) =>
      makeTimeOff({ user: actor, leaveType: w.leaveTypes.vacation, startDate: '2026-12-14' }),
    run: (w, entry) =>
      updateTimeOff({
        id: entry.id,
        leaveTypeId: w.leaveTypes.sick.id,
        startDate: '2026-12-14',
        endDate: '2026-12-14',
        half: 'AM',
        note: 'แก้โดยแถว',
      }),
  }),
  defineRow({
    id: 'PERM-20c',
    spec: '§3.2 ลบวันลาของตัวเอง (FR-909, soft delete + batch)',
    action: 'deleteTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: ALL,
    setup: (w, actor) =>
      makeTimeOff({ user: actor, leaveType: w.leaveTypes.vacation, startDate: '2026-12-14' }),
    run: (_w, entry) => deleteTimeOff({ id: entry.id }),
  }),
  defineRow({
    id: 'PERM-20d',
    spec: '§3.2 กู้คืนวันลาของตัวเอง (FR-909 undo, M5-D16)',
    action: 'restoreTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: ALL,
    setup: async (w, actor) => {
      const batch = randomUUID()
      await makeTimeOff({
        user: actor,
        leaveType: w.leaveTypes.vacation,
        startDate: '2026-12-28',
        deleted: { batch, daysAgo: 1 },
      })
      return batch
    },
    run: (_w, batch) => restoreTimeOff({ batch }),
  }),
  defineRow({
    id: 'PERM-20e',
    spec: '§3.2 บันทึกวันลาของตัวเอง — userId = ตัวเอง ระบุชัด (M5-D3 self → ok)',
    action: 'createTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: ALL,
    run: (w, _ctx, actor) =>
      createTimeOff({
        userId: actor.id,
        leaveTypeId: w.leaveTypes.sick.id,
        startDate: '2026-12-09',
        endDate: '2026-12-09',
        half: 'PM',
      }),
  }),

  // ── PERM-21 another person's leave (manager only; invisible person → 404) ─────────────────────────────────────
  defineRow({
    id: 'PERM-21a',
    spec: '§3.2 บันทึกวันลาของคนอื่น — coworker (visible to everyone)',
    action: 'createTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: OTHERS,
    run: (w) =>
      createTimeOff({
        userId: w.users.coworker!.id,
        leaveTypeId: w.leaveTypes.vacation.id,
        startDate: '2026-12-21',
        endDate: '2026-12-21',
      }),
  }),
  defineRow({
    id: 'PERM-21b',
    spec: '§3.2 บันทึกวันลาของคนอื่น — pOnly (invisible to the outsider → 404, M5-D3)',
    action: 'createTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: OTHERS_P,
    run: (w) =>
      createTimeOff({
        userId: w.users.pOnly!.id,
        leaveTypeId: w.leaveTypes.vacation.id,
        startDate: '2026-12-21',
        endDate: '2026-12-21',
      }),
  }),
  defineRow({
    id: 'PERM-21c',
    spec: '§3.2 แก้วันลาของคนอื่น — coworker’s entry',
    action: 'updateTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: OTHERS,
    run: (w) =>
      updateTimeOff({
        id: w.timeOff.coworker.id,
        leaveTypeId: w.leaveTypes.sick.id,
        startDate: '2026-11-09',
        endDate: '2026-11-10',
        note: 'แก้โดยคนอื่น',
      }),
  }),
  defineRow({
    id: 'PERM-21d',
    spec: '§3.2 แก้วันลาของคนอื่น — pOnly’s entry (invisible owner → 404 for the outsider, R17)',
    action: 'updateTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: OTHERS_P,
    run: (w) =>
      updateTimeOff({
        id: w.timeOff.pOnly.id,
        leaveTypeId: w.leaveTypes.sick.id,
        startDate: '2026-11-16',
        endDate: '2026-11-16',
        half: 'AM',
      }),
  }),
  defineRow({
    id: 'PERM-21e',
    spec: '§3.2 ลบวันลาของคนอื่น — coworker’s entry',
    action: 'deleteTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: OTHERS,
    run: (w) => deleteTimeOff({ id: w.timeOff.coworker.id }),
  }),
  defineRow({
    id: 'PERM-21e-hidden',
    spec: '§3.2 ลบวันลาของคนอื่น — pOnly’s entry by id (invisible owner → 404, M5-D3)',
    action: 'deleteTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: OTHERS_P,
    run: (w) => deleteTimeOff({ id: w.timeOff.pOnly.id }),
  }),
  defineRow({
    id: 'PERM-21f',
    spec: '§3.2 กู้คืนวันลาของคนอื่น — coworker’s deleted batch (FR-909)',
    action: 'restoreTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: OTHERS,
    run: (w) => restoreTimeOff({ batch: w.batches.coworkerDeletedTimeOff }),
  }),
  defineRow({
    id: 'PERM-21g',
    spec: '§3.2 บันทึกวันลาของคนอื่น — a user that does not exist → 404 for everyone (M5-D3)',
    action: 'createTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: each('404'),
    run: (w) =>
      createTimeOff({
        userId: 'no-such-user',
        leaveTypeId: w.leaveTypes.vacation.id,
        startDate: '2026-12-21',
        endDate: '2026-12-21',
      }),
  }),
  defineRow({
    id: 'TO-404-ENTRY',
    spec: 'X41 — update/delete of an entry id that does not exist → 404 for everyone',
    action: 'deleteTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: each('404'),
    run: () => deleteTimeOff({ id: randomUUID() }),
  }),
  defineRow({
    id: 'TO-404-BATCH',
    spec: 'M5-D16 — restore of an unknown batch → 404 for everyone',
    action: 'restoreTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: each('404'),
    run: () => restoreTimeOff({ batch: randomUUID() }),
  }),
  defineRow({
    id: 'TO-400',
    spec: 'FR-903 — half day on a multi-day range is a 400 for everyone (zod, before authz)',
    action: 'createTimeOff',
    mutates: true,
    audit: auditTimeOff,
    with: TIME_OFF,
    expect: each('400'),
    run: (w) =>
      createTimeOff({
        leaveTypeId: w.leaveTypes.vacation.id,
        startDate: '2026-12-07',
        endDate: '2026-12-08',
        half: 'AM',
      }),
  }),
]
