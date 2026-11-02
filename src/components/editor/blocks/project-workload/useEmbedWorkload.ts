'use client'
// GET /api/pages/:id/embed/workload for the "ภาระทีมโปรเจค" live block (FR-1303/1306, M10-D10/D11). No view in the
// request (M9-D2): the block applies its view on the client, so switching views never refetches.
import { useQuery } from '@tanstack/react-query'
import { getJson } from '@/lib/api'
import type { EmbedWorkloadResponse } from '@/lib/contracts/embed'
import { qk } from '@/lib/query-keys'

export function useEmbedWorkload(pageId: string) {
  return useQuery({
    queryKey: qk.pageEmbedWorkload(pageId),
    queryFn: ({ signal }) =>
      getJson<EmbedWorkloadResponse>(`/api/pages/${pageId}/embed/workload`, { signal }),
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
  })
}
