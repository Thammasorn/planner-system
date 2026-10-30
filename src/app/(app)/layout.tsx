import type { ReactNode } from 'react'
import { AppShell } from '@/components/shell/AppShell'

/** Signed-in area chrome. M1 puts `await requirePageUser()` at the top (before any Suspense, X41). */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}
