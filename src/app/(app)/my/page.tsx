import type { Metadata } from 'next'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { MyTasks } from '@/components/tasks/MyTasks'
import { th } from '@/i18n/th'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.my.title }

/** งานของฉัน basic (FR-1009, X22): data from GET /api/tasks/my (the caller's own rows only). */
export default async function MyTasksPage() {
  await requirePageUser()
  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Typography variant="h4" component="h1">
        {th.my.title}
      </Typography>
      <MyTasks />
    </Stack>
  )
}
