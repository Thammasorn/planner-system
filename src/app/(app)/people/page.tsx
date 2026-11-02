import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { PeopleDirectory } from '@/components/people/PeopleDirectory'
import { th } from '@/i18n/th'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.people.title }

/** ทีมงาน `/people` (FR-1008, M9-D14): auth first (X41/X57); the directory comes from GET /api/people (visibleUserIds,
 *  incl. managers) through TanStack Query. */
export default async function PeoplePage() {
  await requirePageUser()
  return (
    <>
      <PageHeaderBar crumbs={[{ label: th.people.title, asHeading: true }]} />
      <Box sx={{ minWidth: 0 }}>
        <PeopleDirectory />
      </Box>
    </>
  )
}
