'use client'
// src/components/home/HomeDashboard.tsx — the /home cards (FR-1101, SPEC §8.2, M10-D13…D18/D34). Data = GET /api/home
// through TanStack (prefetched by the RSC page, so the first paint has it); refreshed by invalidateTasks / invalidateLoad
// / invalidateMilestones. Managers see their two cards first (PRIN-P6). One column below `md` (NFR-07b, 390 px).
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Grid from '@mui/material/Grid'
import { useQuery } from '@tanstack/react-query'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import type { HomeResponse } from '@/lib/contracts/home'
import { qk } from '@/lib/query-keys'
import { LeaveCard } from './LeaveCard'
import { ManagerOverloadCard, ManagerUtilisationCard } from './ManagerCards'
import { MilestonesCard } from './MilestonesCard'
import { MyLoadCard } from './MyLoadCard'
import { MyTasksCard } from './MyTasksCard'
import type { HomeCache } from './patch'
import { RecentPagesCard } from './RecentPagesCard'

export function HomeDashboard() {
  const { data, isPending, isError, refetch, isFetching } = useQuery<HomeResponse, Error, HomeCache>({
    queryKey: qk.home(),
    queryFn: ({ signal }) => getJson<HomeResponse>('/api/home', { signal }),
  })

  if (isPending) return <CircularProgress size={24} aria-label={th.common.loading} />
  if (isError)
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" disabled={isFetching} onClick={() => void refetch()}>
            {th.home.retry}
          </Button>
        }
      >
        {th.home.loadError}
      </Alert>
    )

  const half = { xs: 12, md: 6 } as const
  return (
    <Grid container spacing={2} data-testid="home-dashboard">
      {data.manager ? (
        <>
          <Grid size={half}>
            <ManagerOverloadCard overloaded={data.manager.overloaded} />
          </Grid>
          <Grid size={half}>
            <ManagerUtilisationCard utilisation={data.manager.utilisation} />
          </Grid>
        </>
      ) : null}
      <Grid size={half}>
        <MyTasksCard items={data.myTasks.items} more={data.myTasks.more} />
      </Grid>
      <Grid size={half}>
        <MyLoadCard weeks={data.myLoad} />
      </Grid>
      <Grid size={half}>
        <MilestonesCard milestones={data.milestones} />
      </Grid>
      <Grid size={half}>
        <LeaveCard leave={data.leave} />
      </Grid>
      <Grid size={12}>
        <RecentPagesCard pages={data.recentPages} now={data.now} />
      </Grid>
    </Grid>
  )
}

/** Greeting + Thai date line, rendered by the RSC (Bangkok hour of serverNow(), M10-D19 — no hydration mismatch). */
export function HomeGreeting({ greeting, dateLine }: { greeting: string; dateLine: string }) {
  return (
    <Box component="header" sx={{ mb: 3, minWidth: 0 }}>
      <Box
        component="p"
        data-testid="home-greeting"
        sx={{ m: 0, fontSize: 'var(--font-2xl)', fontWeight: 'var(--weight-bold)', overflowWrap: 'anywhere' }}
      >
        {greeting}
      </Box>
      <Box component="p" data-testid="home-date" sx={{ m: 0, mt: 0.5, color: 'var(--text-secondary)' }}>
        {dateLine}
      </Box>
    </Box>
  )
}
