// tests/authz/rows/calendar.ts — M5 PERM-22a (FR-907, §3.3, X43) — GET /api/calendar; masking details live in
// tests/authz/masking.int.test.ts › calendar (M5). Every logged-in user may open the calendar; what it contains is
// filtered by visibleUserIds(viewer) and masked (M5-D7). Query errors are 400 for everyone (M5-D8, X86).
// plan/m05 S4.3, §7.2.
import { expect } from 'vitest'
import type { CalendarResponse } from '@/lib/contracts/calendar'
import { defineRow, type AuthzRow } from '../types'
import { ALL, calendarGet, each, TIME_OFF } from './_m5'

export const rows: AuthzRow[] = [
  defineRow({
    id: 'PERM-22a',
    spec: 'PERM-22 §3.2/§3.3 ดูปฏิทินทีม — GET /api/calendar 4 weeks (content → masking suite)',
    action: 'GET /api/calendar',
    mutates: false,
    with: TIME_OFF,
    expect: ALL,
    run: async (_w, _ctx, actor) => {
      const res = await calendarGet('2026-11-02', '2026-11-30')
      if (res.status === 200) {
        const body = (await res.clone().json()) as CalendarResponse
        expect(body).toMatchObject({ from: '2026-11-02', to: '2026-11-30', viewer: { userId: actor.id } })
      }
      return res
    },
  }),
  defineRow({
    id: 'CAL-400',
    spec: 'M5-D8 — `from` that is not a Monday is a 400 for everyone',
    action: 'GET /api/calendar',
    mutates: false,
    with: TIME_OFF,
    expect: each('400'),
    run: () => calendarGet('2026-11-03', '2026-11-30'),
  }),
  defineRow({
    id: 'CAL-400-SPAN',
    spec: 'M5-D8 — a span over 42 days (6 weeks) is a 400 for everyone',
    action: 'GET /api/calendar',
    mutates: false,
    with: TIME_OFF,
    expect: each('400'),
    run: () => calendarGet('2026-11-02', '2026-12-21'),
  }),
]
