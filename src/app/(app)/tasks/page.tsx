import type { Metadata } from 'next'
import { Suspense } from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { TeamTasks } from '@/components/tasks/team/TeamTasks'
import { th } from '@/i18n/th'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.teamTasks.title }

/** งานของทีม `/tasks` (FR-665/666, X75): visibility is filtered in SQL by GET /api/tasks. Auth first. */
export default async function TeamTasksPage() {
  await requirePageUser()
  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Typography variant="h4" component="h1">
        {th.teamTasks.title}
      </Typography>
      {/* useSearchParams (filters) lives under its own boundary */}
      <Suspense>
        <TeamTasks />
      </Suspense>
    </Stack>
  )
}
