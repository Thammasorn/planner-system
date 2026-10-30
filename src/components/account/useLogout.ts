'use client'
import { useTransition } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { logout } from '@/server/actions/auth'
import { hardNavigate } from './hard-navigate'

/** Logout (FR-101): action → clear the TanStack cache → full navigation to /login (PLAN §3.5, M1-D7). */
export function useLogout(): { logout: () => void; pending: boolean } {
  const queryClient = useQueryClient()
  const [pending, startTransition] = useTransition()
  const run = () =>
    startTransition(async () => {
      const r = await logout({})
      // An already-expired session is as good as logged out.
      if (!r.ok && r.code !== 'UNAUTHENTICATED') {
        toast.error(r.message)
        return
      }
      queryClient.clear()
      hardNavigate(r.ok ? r.redirectTo : '/login')
    })
  return { logout: run, pending }
}
