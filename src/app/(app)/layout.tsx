import type { ReactNode } from 'react'
import { CurrentUserProvider } from '@/components/providers/CurrentUserProvider'
import { TodayProvider } from '@/components/providers/TodayProvider'
import { AppShell } from '@/components/shell/AppShell'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { requirePageUser, toCurrentUserDTO } from '@/server/session'

/**
 * Signed-in area chrome. `requirePageUser()` runs first, before any Suspense boundary (X41/X57): no session →
 * /login, password change due → /account/password. Only the client-safe DTO reaches client components.
 * M9-D11 (X31): the Workload ทีม ●N is computed here once (visible population, OVER cells in the next 4 weeks); the
 * sidebar's client query refreshes it (layouts do not re-render on navigation).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser()
  const today = serverToday()
  const badge = await db.transaction((tx) => services.workload.badgeCount(tx, user, today), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  })
  return (
    <CurrentUserProvider user={toCurrentUserDTO(user)}>
      <TodayProvider today={today}>
        <AppShell initialWorkloadOver={badge.overCount}>{children}</AppShell>
      </TodayProvider>
    </CurrentUserProvider>
  )
}
