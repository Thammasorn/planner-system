'use client'
import { createContext, useContext } from 'react'
import type { CurrentUserDTO } from '@/lib/contracts/users'

export const CurrentUserContext = createContext<CurrentUserDTO | null>(null)

/** The signed-in user inside `(app)` pages; null elsewhere. UI hints only — the server decides access. */
export function useCurrentUser(): CurrentUserDTO | null {
  return useContext(CurrentUserContext)
}
