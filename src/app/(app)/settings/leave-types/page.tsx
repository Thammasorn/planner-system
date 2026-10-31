import type { Metadata } from 'next'
import { LeaveTypesList } from '@/components/settings/leave-types/LeaveTypesList'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import { listLeaveTypes } from '@/server/services/leave-types'
import { requireManagerPage } from '@/server/session'

export const metadata: Metadata = { title: th.leaveTypes.title }

/** FR-902: leave types (manager only — workers get a 404, X41): name, colour, order, archive, delete-or-archive. */
export default async function LeaveTypesPage() {
  await requireManagerPage()
  const rows = await listLeaveTypes(db, { includeArchived: true })
  return <LeaveTypesList rows={rows} />
}
