import type { Metadata } from 'next'
import { Suspense } from 'react'
import Box from '@mui/material/Box'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { TeamTasks } from '@/components/tasks/team/TeamTasks'
import { th } from '@/i18n/th'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.teamTasks.title }

/** งานของทีม `/tasks` (FR-665/666, X75): visibility is filtered in SQL by GET /api/tasks. Auth first. The header bar
 *  (FR-1603) names the screen; the view toggle stays in the TeamTasks toolbar (TeamTasks may portal it through
 *  `HeaderActions`). */
export default async function TeamTasksPage() {
  await requirePageUser()
  return (
    <>
      <PageHeaderBar crumbs={[{ label: th.teamTasks.title, asHeading: true }]} />
      <Box sx={{ minWidth: 0 }}>
        {/* useSearchParams (filters) lives under its own boundary */}
        <Suspense>
          <TeamTasks />
        </Suspense>
      </Box>
    </>
  )
}
