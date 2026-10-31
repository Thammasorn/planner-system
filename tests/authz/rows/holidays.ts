// tests/authz/rows/holidays.ts — M5 PERM-02f…02j (FR-901) — holiday actions; manager only, workers 403 (X41,
// M5-D15: reads stay open, writes are manager-only). plan/m05 S4.1, §7.2. Each allowed call writes exactly one
// `holiday` audit row (M5-D2; the CSV import writes one row for the whole file).
import { eq } from 'drizzle-orm'
import {
  createHoliday,
  deleteHoliday,
  importHolidays,
  restoreHoliday,
  updateHoliday,
} from '@/server/actions/holidays'
import { db } from '@/server/db/client'
import { holidays } from '@/server/db/schema'
import { makeHoliday } from '../../helpers/factories'
import { defineRow, type AuthzRow } from '../types'
import { auditHoliday, MGR, TIME_OFF } from './_m5'

export const rows: AuthzRow[] = [
  defineRow({
    id: 'PERM-02f',
    spec: '§3.2 จัดการวันหยุด — เพิ่ม (FR-901)',
    action: 'createHoliday',
    mutates: true,
    audit: auditHoliday,
    with: TIME_OFF,
    expect: MGR,
    run: () => createHoliday({ date: '2027-01-02', name: 'วันหยุดแถว' }),
  }),
  defineRow({
    id: 'PERM-02g',
    spec: '§3.2 จัดการวันหยุด — แก้ (FR-901)',
    action: 'updateHoliday',
    mutates: true,
    audit: auditHoliday,
    with: TIME_OFF,
    expect: MGR,
    run: (w) => updateHoliday({ id: w.holidays.h1.id, date: '2026-11-21', name: 'แก้' }),
  }),
  defineRow({
    id: 'PERM-02h',
    spec: '§3.2 จัดการวันหยุด — ลบ (hard delete + undo, X64)',
    action: 'deleteHoliday',
    mutates: true,
    audit: auditHoliday,
    with: TIME_OFF,
    expect: MGR,
    run: (w) => deleteHoliday({ id: w.holidays.h1.id }),
  }),
  defineRow({
    id: 'PERM-02i',
    spec: '§3.2 จัดการวันหยุด — กู้คืนหลังลบ (undo re-inserts the same id, X04)',
    action: 'restoreHoliday',
    mutates: true,
    audit: auditHoliday,
    with: TIME_OFF,
    expect: MGR,
    setup: async () => {
      const h = await makeHoliday({ date: '2027-02-01', name: 'วันหยุดที่ลบแล้ว' })
      await db.delete(holidays).where(eq(holidays.id, h.id))
      return { id: h.id, date: h.date, name: h.name }
    },
    run: (_w, snapshot) => restoreHoliday(snapshot),
  }),
  defineRow({
    id: 'PERM-02j',
    spec: '§3.2 จัดการวันหยุด — นำเข้า CSV (FR-901, M5-D11; one audit row per import)',
    action: 'importHolidays',
    mutates: true,
    audit: auditHoliday,
    with: TIME_OFF,
    expect: MGR,
    run: () => importHolidays({ rows: [{ date: '2027-01-03', name: 'x' }] }),
  }),
]
