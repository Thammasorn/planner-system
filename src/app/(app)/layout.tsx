import type { ReactNode } from 'react'
import { CurrentUserProvider } from '@/components/providers/CurrentUserProvider'
import { TodayProvider } from '@/components/providers/TodayProvider'
import { AppShell } from '@/components/shell/AppShell'
import { serverToday } from '@/server/clock'
import { requirePageUser, toCurrentUserDTO } from '@/server/session'

/**
 * Signed-in area chrome. `requirePageUser()` runs first, before any Suspense boundary (X41/X57): no session →
 * /login, password change due → /account/password. Only the client-safe DTO reaches client components.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser()
  return (
    <CurrentUserProvider user={toCurrentUserDTO(user)}>
      <TodayProvider today={serverToday()}>
        <AppShell>{children}</AppShell>
      </TodayProvider>
    </CurrentUserProvider>
  )
}
