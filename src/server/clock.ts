// src/server/clock.ts — "now" and "today" for business logic (PLAN.md §3.4.7, X45, BR-06).
// APP_NOW is honoured only when ALLOW_TEST_HOOKS=1 (e2e / integration tests). Never used for sessions, auth or the
// lockout window. Services never read the clock: actions/routes call serverToday() and pass `today` down (M1-D4).
// Reads process.env on every call (not getEnv()'s cache) so tests can stub it per case.
import 'server-only'
import { todayBangkok } from '@/domain/dates'
import type { ISODate } from '@/domain/types'

export function serverNow(): Date {
  const pinned = process.env.ALLOW_TEST_HOOKS === '1' ? process.env.APP_NOW : undefined
  if (pinned) {
    const d = new Date(pinned)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

/** Today in Asia/Bangkok as 'YYYY-MM-DD'. */
export function serverToday(): ISODate {
  return todayBangkok(serverNow())
}
