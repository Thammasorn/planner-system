// Own-account actions (FR-105, FR-107): every signed-in user, allowed while a password change is due (M1-D6),
// audited as entity 'user' (M1-D9). plan/m01-auth-employees.md §7.2.
import { changeOwnPassword, signOutEverywhere } from '@/server/actions/auth'
import { defineRow, type AuthzRow } from '../types'

const ALL = { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' } as const

export const rows: AuthzRow[] = [
  defineRow({
    id: 'ACC-01',
    spec: 'FR-105 เปลี่ยนรหัสผ่านตัวเอง',
    action: 'changeOwnPassword',
    mutates: true,
    audit: { entity: 'user' },
    allowMustChange: true,
    expect: ALL,
    run: (_w, _ctx, actor) =>
      changeOwnPassword({
        currentPassword: actor.password,
        newPassword: 'Changed-pass-42',
        confirmPassword: 'Changed-pass-42',
      }),
  }),
  defineRow({
    id: 'ACC-02',
    spec: 'FR-107 ออกจากระบบทุกอุปกรณ์',
    action: 'signOutEverywhere',
    mutates: true,
    audit: { entity: 'user' },
    allowMustChange: true,
    expect: ALL,
    run: () => signOutEverywhere({}),
  }),
]
