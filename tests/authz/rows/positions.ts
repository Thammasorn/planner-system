// PERM-02 (positions part) — SPEC §3.2 "จัดการตำแหน่ง, วันหยุด, ประเภทการลา": manager only (reads stay open).
// plan/m01-auth-employees.md §7.2. Holidays/leave types arrive in M5.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import {
  createPosition,
  deletePosition,
  movePosition,
  renamePosition,
  restorePosition,
} from '@/server/actions/positions'
import { db } from '@/server/db/client'
import { positions } from '@/server/db/schema'
import { makePosition } from '../../helpers/factories'
import { defineRow, type AuthzRow } from '../types'

const MGR = { M: 'allow', L: '403', Me: '403', W: '403' } as const
const AUDIT = { entity: 'position' } as const

export const rows: AuthzRow[] = [
  defineRow({
    id: 'PERM-02a',
    spec: '§3.2 จัดการตำแหน่ง — สร้าง',
    action: 'createPosition',
    mutates: true,
    audit: AUDIT,
    expect: MGR,
    run: () => createPosition({ name: `Pos ${randomUUID().slice(0, 8)}` }),
  }),
  defineRow({
    id: 'PERM-02b',
    spec: '§3.2 จัดการตำแหน่ง — เปลี่ยนชื่อ',
    action: 'renamePosition',
    mutates: true,
    audit: AUDIT,
    expect: MGR,
    setup: () => makePosition('Old Name'),
    run: (_w, p) => renamePosition({ id: p.id, name: 'New Name' }),
  }),
  defineRow({
    id: 'PERM-02c',
    spec: '§3.2 จัดการตำแหน่ง — เรียงลำดับ',
    action: 'movePosition',
    mutates: true,
    audit: AUDIT,
    expect: MGR,
    setup: async () => {
      await makePosition('First')
      return makePosition('Second')
    },
    run: (_w, second) => movePosition({ id: second.id, direction: 'up' }),
  }),
  defineRow({
    id: 'PERM-02d',
    spec: '§3.2 จัดการตำแหน่ง — ลบ (ไม่มีคนใช้)',
    action: 'deletePosition',
    mutates: true,
    audit: AUDIT,
    expect: MGR,
    setup: () => makePosition('Unused'),
    run: (_w, p) => deletePosition({ id: p.id }),
  }),
  defineRow({
    id: 'PERM-02e',
    spec: '§3.2 จัดการตำแหน่ง — กู้คืนหลังลบ (undo)',
    action: 'restorePosition',
    mutates: true,
    audit: AUDIT,
    expect: MGR,
    setup: async () => {
      const p = await makePosition('Gone')
      await db.delete(positions).where(eq(positions.id, p.id))
      return p
    },
    run: (_w, p) => restorePosition({ id: p.id, name: p.name, position: p.position }),
  }),
]
