'use client'
import type { ReactNode } from 'react'
import { CurrentUserContext } from '@/hooks/useCurrentUser'
import type { CurrentUserDTO } from '@/lib/contracts/users'

/** Set by `(app)/layout.tsx` from `toCurrentUserDTO(requirePageUser())` (no session fields reach the client). */
export function CurrentUserProvider({ user, children }: { user: CurrentUserDTO; children: ReactNode }) {
  return <CurrentUserContext value={user}>{children}</CurrentUserContext>
}
