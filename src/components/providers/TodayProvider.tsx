'use client'
import type { ReactNode } from 'react'
import type { ISODate } from '@/domain/types'
import { TodayContext } from '@/hooks/useToday'

/** `(app)/layout.tsx` passes `serverToday()` so SSR and the client agree on the date (PLAN §3.6). */
export function TodayProvider({ today, children }: { today: ISODate; children: ReactNode }) {
  return <TodayContext value={today}>{children}</TodayContext>
}
