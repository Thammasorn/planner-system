import type { Metadata } from 'next'
import { HolidaysTable } from '@/components/settings/holidays/HolidaysTable'
import { th } from '@/i18n/th'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { listHolidays } from '@/server/services/holidays'
import { requireManagerPage } from '@/server/session'

export const metadata: Metadata = { title: th.holidays.title }

/** FR-901: company holidays (manager only — workers get a 404, X41), with CSV import (M5-D11). */
export default async function HolidaysPage() {
  await requireManagerPage()
  const rows = await listHolidays(db)
  return <HolidaysTable rows={rows} initialYear={Number(serverToday().slice(0, 4))} />
}
