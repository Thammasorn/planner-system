// tests/authz/rows/leave-types.ts — M5 PERM-02k…02p (FR-902) — leave type actions + GET /api/leave-types (M5-D9/D15).
// Writes: manager only, workers 403 (X41). Read: every logged-in user gets the active types in order (M5-D9).
// plan/m05 S4.1, §7.2. The world has three active types (vacation, sick, training) + one archived, so the
// "last active type" guard (M5-D10) never interferes with these rows.
import { eq } from 'drizzle-orm'
import { expect } from 'vitest'
import type { LeaveTypesResponse } from '@/lib/contracts/leave-types'
import {
  createLeaveType,
  deleteLeaveType,
  moveLeaveType,
  restoreLeaveType,
  setLeaveTypeArchived,
  updateLeaveType,
} from '@/server/actions/leave-types'
import { db } from '@/server/db/client'
import { leaveTypes } from '@/server/db/schema'
import { makeLeaveType } from '../../helpers/factories'
import { defineRow, type AuthzRow } from '../types'
import { ALL, auditLeaveType, leaveTypesGet, MGR, TIME_OFF } from './_m5'

export const rows: AuthzRow[] = [
  defineRow({
    id: 'PERM-02k',
    spec: '§3.2 จัดการประเภทการลา — เพิ่ม (FR-902)',
    action: 'createLeaveType',
    mutates: true,
    audit: auditLeaveType,
    with: TIME_OFF,
    expect: MGR,
    run: () => createLeaveType({ name: 'ลาบวช-แถว', color: '#0F766E' }),
  }),
  defineRow({
    id: 'PERM-02l',
    spec: '§3.2 จัดการประเภทการลา — แก้ชื่อ/สี (FR-902)',
    action: 'updateLeaveType',
    mutates: true,
    audit: auditLeaveType,
    with: TIME_OFF,
    expect: MGR,
    run: (w) => updateLeaveType({ id: w.leaveTypes.sick.id, name: 'ลาป่วย-แก้' }),
  }),
  defineRow({
    id: 'PERM-02m',
    spec: '§3.2 จัดการประเภทการลา — เรียงลำดับ (FR-902, X58 intent only)',
    action: 'moveLeaveType',
    mutates: true,
    audit: auditLeaveType,
    with: TIME_OFF,
    expect: MGR,
    run: (w) => moveLeaveType({ id: w.leaveTypes.sick.id, direction: 'up' }),
  }),
  defineRow({
    id: 'PERM-02n',
    spec: '§3.2 จัดการประเภทการลา — ลบ (ไม่มีการใช้ → hard delete, M5-D10)',
    action: 'deleteLeaveType',
    mutates: true,
    audit: auditLeaveType,
    with: TIME_OFF,
    expect: MGR,
    setup: () => makeLeaveType({ name: 'ลาไม่ได้ใช้-แถว' }),
    run: (_w, t) => deleteLeaveType({ id: t.id }),
  }),
  defineRow({
    id: 'PERM-02n-archive',
    spec: '§3.2 จัดการประเภทการลา — ลบประเภทที่มีการใช้ → เก็บเข้าคลังแทน (M5-D10)',
    action: 'deleteLeaveType',
    mutates: true,
    audit: auditLeaveType,
    with: TIME_OFF,
    expect: MGR,
    run: (w) => deleteLeaveType({ id: w.leaveTypes.vacation.id }),
  }),
  defineRow({
    id: 'PERM-02o',
    spec: '§3.2 จัดการประเภทการลา — กู้คืนหลังลบ (undo: same id/name/colour/position, M5-D10)',
    action: 'restoreLeaveType',
    mutates: true,
    audit: auditLeaveType,
    with: TIME_OFF,
    expect: MGR,
    setup: async () => {
      const t = await makeLeaveType({ name: 'ลาที่ลบแล้ว-แถว', color: '#0F766E' })
      await db.delete(leaveTypes).where(eq(leaveTypes.id, t.id))
      return { id: t.id, name: t.name, color: t.color, position: t.position, archivedAt: null }
    },
    run: (_w, snapshot) => restoreLeaveType(snapshot),
  }),
  defineRow({
    id: 'PERM-02p',
    spec: '§3.2 จัดการประเภทการลา — เก็บเข้าคลัง (FR-902)',
    action: 'setLeaveTypeArchived',
    mutates: true,
    audit: auditLeaveType,
    with: TIME_OFF,
    expect: MGR,
    run: (w) => setLeaveTypeArchived({ id: w.leaveTypes.sick.id, archived: true }),
  }),
  defineRow({
    id: 'PERM-02p-unarchive',
    spec: '§3.2 จัดการประเภทการลา — นำกลับมาใช้ (FR-902, X64)',
    action: 'setLeaveTypeArchived',
    mutates: true,
    audit: auditLeaveType,
    with: TIME_OFF,
    expect: MGR,
    run: (w) => setLeaveTypeArchived({ id: w.leaveTypes.archived.id, archived: false }),
  }),
  defineRow({
    id: 'LT-READ',
    spec: 'M5-D9/D15 อ่านประเภทการลา — GET /api/leave-types (active only, in order)',
    action: 'GET /api/leave-types',
    mutates: false,
    with: TIME_OFF,
    expect: ALL,
    run: async (w) => {
      const res = await leaveTypesGet()
      if (res.status === 200) {
        const body = (await res.clone().json()) as LeaveTypesResponse
        const { vacation, sick, training } = w.leaveTypes
        expect(body.leaveTypes).toEqual(
          [vacation, sick, training].map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            archived: false,
          })),
        )
      }
      return res
    },
  }),
]
