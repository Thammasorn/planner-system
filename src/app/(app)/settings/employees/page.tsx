import type { Metadata } from 'next'
import { EmployeesTable } from '@/components/settings/employees/EmployeesTable'
import { th } from '@/i18n/th'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { requireManagerPage } from '@/server/session'

export const metadata: Metadata = { title: th.employees.title }

/** FR-201…FR-209: the employee list (≤ 100 rows, filtered on the client — M1-D15). Actions call refresh(). */
export default async function EmployeesPage() {
  const me = await requireManagerPage()
  const [rows, positions] = await Promise.all([
    services.employees.listEmployees(db),
    services.positions.listPositions(db),
  ])
  return <EmployeesTable rows={rows} positions={positions} currentUserId={me.id} />
}
