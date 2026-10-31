// tests/authz/rows/_m5.ts — shared helpers for the four M5 rows files (holidays, leave types, time off, calendar;
// plan/m05 S4.1–S4.3, §7.2). No rows here. Expectations follow SPEC §3.2 and X41 / M5-D3: manager-only settings
// writes → 403 for workers; another person's leave → 403, or 404 when the person is not visible to the actor.
import { vi } from 'vitest'
import { GET as GET_CALENDAR } from '@/app/api/calendar/route'
import { GET as GET_LEAVE_TYPES } from '@/app/api/leave-types/route'
import type { WorldPart } from '../../helpers/world'
import { callRoute } from '../_support/http'
import type { Outcome, Role } from '../types'

/** PERM-02 (วันหยุด, ประเภทการลา): manager only; every worker 403 (the settings are global, X41). */
export const MGR = { M: 'allow', L: '403', Me: '403', W: '403' } as const satisfies Record<Role, Outcome>
/** PERM-20 / PERM-22 / M5-D15 reads: every logged-in user. */
export const ALL = { M: 'allow', L: 'allow', Me: 'allow', W: 'allow' } as const satisfies Record<
  Role,
  Outcome
>
/** PERM-21 on `w.users.coworker` (MEMBER of P and Q → visible to every world role): workers 403. */
export const OTHERS = MGR
/** PERM-21 on `w.users.pOnly` (MEMBER of P only → invisible to the outsider, M5-D3): outsider 404. */
export const OTHERS_P = { M: 'allow', L: '403', Me: '403', W: '404' } as const satisfies Record<Role, Outcome>
/** The same outcome for every role. */
export const each = (o: Outcome): Record<Role, Outcome> => ({ M: o, L: o, Me: o, W: o })

/** Every M5 row needs the leave world (leave types, coworker / pOnly, entries, holiday h1; plan/m05 S0.15). */
export const TIME_OFF = ['timeOff'] as const satisfies readonly WorldPart[]

/** Audit expectations (X44, M5-D2): global entities, so the audit row's project_id is null. */
export const auditHoliday = { entity: 'holiday' } as const
export const auditLeaveType = { entity: 'leave_type' } as const
export const auditTimeOff = { entity: 'time_off' } as const

/** X45: "today" pinned for routes that read serverToday() (the calendar passes it down for M8, X90). */
export function pinToday(): void {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
}

/** `GET /api/calendar?from&to` as the current asUser() session. */
export function calendarGet(from: string, to: string): Promise<Response> {
  pinToday()
  return callRoute(GET_CALENDAR, `/api/calendar?from=${from}&to=${to}`)
}

export const leaveTypesGet = (): Promise<Response> => callRoute(GET_LEAVE_TYPES, '/api/leave-types')
