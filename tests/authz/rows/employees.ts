// PERM-01 — SPEC §3.2 "สร้าง/แก้/ปิดใช้งานพนักงาน, ตั้ง/รีเซ็ตรหัสผ่าน": manager only. Workers get 403 for global
// manager-only actions (X41). plan/m01-auth-employees.md §7.2.
import { randomUUID } from 'node:crypto'
import {
  createEmployee,
  deactivateEmployee,
  reactivateEmployee,
  resetEmployeePassword,
  updateEmployee,
} from '@/server/actions/employees'
import { makeUser } from '../../helpers/factories'
import { defineRow, type AuthzRow } from '../types'

const MGR = { M: 'allow', L: '403', Me: '403', W: '403' } as const

export const rows: AuthzRow[] = [
  defineRow({
    id: 'PERM-01a',
    spec: '§3.2 สร้างพนักงาน',
    action: 'createEmployee',
    mutates: true,
    audit: { entity: 'user' },
    expect: MGR,
    run: () =>
      createEmployee({
        name: 'Nok Test',
        email: `nok-${randomUUID()}@example.com`,
        positionId: null,
        role: 'worker',
        password: 'Start-pass-99',
      }),
  }),
  defineRow({
    id: 'PERM-01b',
    spec: '§3.2 แก้พนักงาน (profile + role + schedule)',
    action: 'updateEmployee',
    mutates: true,
    audit: { entity: 'user' },
    expect: MGR,
    setup: () => makeUser({ nickname: 'Target' }),
    run: (_w, t) =>
      updateEmployee({
        userId: t.id,
        name: 'Target Renamed',
        nickname: 'Tg',
        email: t.email,
        positionId: null,
        role: 'manager',
        schedule: [{ weekday: 1, fractionCd: 50 }],
      }),
  }),
  defineRow({
    id: 'PERM-01c',
    spec: '§3.2 ปิดใช้งานพนักงาน',
    action: 'deactivateEmployee',
    mutates: true,
    audit: { entity: 'user' },
    expect: MGR,
    setup: () => makeUser(),
    run: (_w, t) => deactivateEmployee({ userId: t.id }),
  }),
  defineRow({
    id: 'PERM-01d',
    spec: '§3.2 เปิดใช้งานพนักงาน (FR-205)',
    action: 'reactivateEmployee',
    mutates: true,
    audit: { entity: 'user' },
    expect: MGR,
    setup: () => makeUser({ deactivated: { on: '2026-09-01' } }),
    run: (_w, t) => reactivateEmployee({ userId: t.id }),
  }),
  defineRow({
    id: 'PERM-01e',
    spec: '§3.2 รีเซ็ตรหัสผ่าน (FR-204)',
    action: 'resetEmployeePassword',
    mutates: true,
    audit: { entity: 'user' },
    expect: MGR,
    setup: () => makeUser(),
    run: (_w, t) => resetEmployeePassword({ userId: t.id, password: 'Reset-pass-77' }),
  }),
]
