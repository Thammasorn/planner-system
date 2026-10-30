import type { Metadata } from 'next'
import { PositionsList } from '@/components/settings/positions/PositionsList'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { requireManagerPage } from '@/server/session'

export const metadata: Metadata = { title: th.positions.title }

/** FR-208: positions with order, user counts, rename, move and delete with undo (M1-D14). */
export default async function PositionsPage() {
  await requireManagerPage()
  const rows = await services.positions.listPositions(db)
  return <PositionsList rows={rows} />
}
