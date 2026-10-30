'use client'
import { createContext, useContext } from 'react'
import type { ISODate } from '@/domain/types'

export const TodayContext = createContext<ISODate | null>(null)

/** "Today" in Asia/Bangkok as the server saw it (`serverToday()`, honours APP_NOW in tests) — PLAN §3.6. */
export function useToday(): ISODate {
  const today = useContext(TodayContext)
  if (today === null) throw new Error('useToday must be used inside <TodayProvider>')
  return today
}
