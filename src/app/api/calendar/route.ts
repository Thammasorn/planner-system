// GET /api/calendar?from&to — month calendar data (FR-907, §3.3, X43, M5-D7/D8). `from`/`to` are Mondays, `to`
// exclusive, ≤ 42 days (calendarQuerySchema; 400 otherwise). Authz (AZ-2): authz.requireUser, then the service
// selects only visibleUserIds(viewer) and masks other people's leave (maskTimeOff). One read-only REPEATABLE READ
// transaction (PLAN §3.4.5); "today" from serverToday() (X90, used by M8).
import type { CalendarResponse } from '@/lib/contracts/calendar'
import { calendarQuerySchema } from '@/lib/schemas/calendar'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import * as services from '@/server/services'

export const GET = route(
  (_req, { user, query }): Promise<CalendarResponse> => {
    authz.requireUser(user)
    const today = serverToday()
    return db.transaction((tx) => services.calendar.getCalendar(tx, user, query, today), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  },
  { query: calendarQuerySchema },
)
