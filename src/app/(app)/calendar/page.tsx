import type { Metadata } from 'next'
import { TeamCalendar } from '@/components/calendar/TeamCalendar'
import { th } from '@/i18n/th'
import { isYearMonth, yearMonthOf } from '@/lib/calendar/month-grid'
import { serverToday } from '@/server/clock'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.calendar.title }

/** ปฏิทินทีม `/calendar?month=YYYY-MM` (FR-907/908): auth first, no Suspense above it (X41/X57). Leave and holidays
 *  come from GET /api/calendar (visibility + masking on the server); the default month is "today" (X45). */
export default async function CalendarPage(props: PageProps<'/calendar'>) {
  await requirePageUser()
  const sp = await props.searchParams
  const month = typeof sp.month === 'string' && isYearMonth(sp.month) ? sp.month : yearMonthOf(serverToday())
  // key: a client navigation to another ?month= (e.g. the sidebar link) starts from that month
  return <TeamCalendar key={month} initialMonth={month} />
}
