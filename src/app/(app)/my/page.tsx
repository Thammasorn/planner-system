import type { Metadata } from 'next'
import { Suspense } from 'react'
import Box from '@mui/material/Box'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { MyTasksView } from '@/components/tasks/MyTasks'
import { th } from '@/i18n/th'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.my.title }

/** งานของฉัน (FR-1009, FR-667, X22, M9-D15/D17): buckets from GET /api/tasks/my (the caller's own rows only); the
 *  ลิสต์ / บอร์ด views (`?view=`) reuse /tasks's TeamTasks fixed to me. Header bar per FR-1603. */
export default async function MyTasksPage() {
  await requirePageUser()
  return (
    <>
      <PageHeaderBar crumbs={[{ label: th.my.title, asHeading: true }]} />
      <Box sx={{ minWidth: 0 }}>
        {/* useSearchParams (?view=) lives under its own boundary, below the auth check */}
        <Suspense>
          <MyTasksView />
        </Suspense>
      </Box>
    </>
  )
}
