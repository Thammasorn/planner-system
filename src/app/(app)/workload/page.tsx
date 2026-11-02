import type { Metadata } from 'next'
import { Suspense } from 'react'
import Box from '@mui/material/Box'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { WorkloadPage } from '@/components/workload/WorkloadPage'
import { th } from '@/i18n/th'
import { gridPreference } from '@/lib/schemas/preferences'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { requirePageUser } from '@/server/session'

export const metadata: Metadata = { title: th.workload.title }

/** Workload ทีม `/workload` (SPEC §8.5, FR-1001…1006): auth first, no Suspense above it (X41/X57). The table data comes
 *  from GET /api/workload through TanStack Query (visibility + masking on the server); the view is the `load.view`
 *  preference (M6-D21), read here so the first render matches. Full-width work screen (SPEC §8.12). */
export default async function WorkloadRoute() {
  const user = await requirePageUser()
  const prefs = await services.preferences.getPreferences(db, user.id)
  return (
    <>
      <PageHeaderBar crumbs={[{ label: th.workload.title, asHeading: true }]} />
      <Box sx={{ minWidth: 0 }}>
        {/* useSearchParams (filters in the URL) lives under its own boundary, below the auth check */}
        <Suspense>
          <WorkloadPage initialView={gridPreference(prefs, 'load.view')} />
        </Suspense>
      </Box>
    </>
  )
}
