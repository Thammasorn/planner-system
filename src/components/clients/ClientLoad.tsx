'use client'
// src/components/clients/ClientLoad.tsx — FR-303 load part (M9-D20, X15): Σ load of the client's projects that the
// viewer can see and that are not archived, over the next 12 weeks (days, M9-D21); a worker is told the sum covers
// only the projects they belong to (a hidden project is never summed — §3.3).
import Typography from '@mui/material/Typography'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useClientLoad } from '@/hooks/useWorkload'
import { th } from '@/i18n/th'
import type { LoadPair } from '@/domain/types'
import type { ClientLoadResponse } from '@/lib/contracts/workload'
import { twoDecimals } from '@/lib/workload/format'

export function ClientLoadSummary({ data }: { data: ClientLoadResponse | undefined }) {
  const isManager = useCurrentUser()?.role === 'manager'
  if (!data) return null
  return (
    <Typography variant="body2" data-testid="client-load">
      {th.workload.clientLoad.total(twoDecimals(data.sum.total))}
      {isManager ? null : (
        <Typography component="span" variant="body2" sx={{ color: 'var(--text-secondary)', ml: 1 }}>
          {`(${th.workload.clientLoad.visibleOnly})`}
        </Typography>
      )}
    </Typography>
  )
}

/** The client page's load query + the per-project sums for ProjectsTable's load column ({} while loading). */
export function useClientLoadView(clientId: string): {
  data: ClientLoadResponse | undefined
  loadByProject: Record<string, LoadPair>
} {
  const q = useClientLoad(clientId)
  const loadByProject: Record<string, LoadPair> = {}
  for (const p of q.data?.projects ?? []) loadByProject[p.projectId] = p.sum
  return { data: q.data, loadByProject }
}
