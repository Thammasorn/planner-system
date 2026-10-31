'use client'
import { useQuery } from '@tanstack/react-query'
import { getJson } from '@/lib/api'
import type { ClientOptionsResponse } from '@/lib/contracts/clients'
import { qk } from '@/lib/query-keys'

/** Client picker options (M2-D04): `projectId = null` → manager-only list of non-archived clients; with a project id
 *  the project's current client is included even when archived. Fetched only while `enabled` (dialog open). */
export function useClientOptions(projectId: string | null, enabled: boolean) {
  const url = projectId
    ? `/api/clients/options?projectId=${encodeURIComponent(projectId)}`
    : '/api/clients/options'
  return useQuery({
    queryKey: qk.clientOptions(projectId),
    queryFn: ({ signal }) => getJson<ClientOptionsResponse>(url, { signal }),
    select: (r) => r.clients,
    enabled,
  })
}
