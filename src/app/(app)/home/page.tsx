import type { Metadata } from 'next'
import { dehydrate, HydrationBoundary, noop } from '@tanstack/react-query'
import { HomeDashboard, HomeGreeting } from '@/components/home/HomeDashboard'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { th } from '@/i18n/th'
import { displayName } from '@/lib/display-name'
import { bangkokHour, formatHomeDate } from '@/lib/format'
import { greetingKey } from '@/lib/home/greeting'
import { makeQueryClient } from '@/lib/query-client'
import { qk } from '@/lib/query-keys'
import { serverNow, serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { getHome } from '@/server/services/home'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.home.title }

/**
 * `/home` (FR-1101, X32, M10-D19/D34): the first page after login. The header bar's <h1> stays "หน้าหลัก" (FR-1603,
 * SPEC v3.2 — one h1 per work screen); the greeting by the Bangkok hour and the Thai date line are rendered here, so
 * the client never recomputes them (X45). The dashboard data is prefetched in one read-only snapshot and handed to
 * TanStack through HydrationBoundary; later refreshes go through GET /api/home. No loading.tsx / Suspense above (X57).
 */
export default async function HomePage() {
  const user = await requirePageUser()
  const now = serverNow()
  const today = serverToday()
  const qc = makeQueryClient()
  // a failed prefetch is not dehydrated: the client fetches GET /api/home itself and shows its own error + retry
  await qc
    .query({
      queryKey: qk.home(),
      queryFn: () =>
        db.transaction((tx) => getHome(tx, user, { today, now }), {
          isolationLevel: 'repeatable read',
          accessMode: 'read only',
        }),
    })
    .catch(noop)
  const greeting = th.home.greetingFor[greetingKey(bangkokHour(now))](displayName(user))
  return (
    <>
      <PageHeaderBar crumbs={[{ label: th.home.title, asHeading: true }]} />
      <HydrationBoundary state={dehydrate(qc)}>
        <HomeGreeting greeting={greeting} dateLine={formatHomeDate(today)} />
        <HomeDashboard />
      </HydrationBoundary>
    </>
  )
}
