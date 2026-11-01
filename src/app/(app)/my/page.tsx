import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { MyTasks } from '@/components/tasks/MyTasks'
import { th } from '@/i18n/th'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.my.title }

/** งานของฉัน basic (FR-1009, X22): data from GET /api/tasks/my (the caller's own rows only). Header bar per FR-1603. */
export default async function MyTasksPage() {
  await requirePageUser()
  return (
    <>
      <PageHeaderBar crumbs={[{ label: th.my.title, asHeading: true }]} />
      <Box sx={{ minWidth: 0 }}>
        <MyTasks />
      </Box>
    </>
  )
}
