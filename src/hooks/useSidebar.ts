'use client'
import { useQuery } from '@tanstack/react-query'
import { getJson } from '@/lib/api'
import type { SidebarResponse } from '@/lib/contracts/sidebar'
import { qk } from '@/lib/query-keys'

/** Sidebar data (M2-D08, M3 my-task count): refreshed by invalidateProjects / invalidateTasks and on window focus. */
export function useSidebar() {
  return useQuery({
    queryKey: qk.sidebar(),
    queryFn: ({ signal }) => getJson<SidebarResponse>('/api/sidebar', { signal }),
  })
}
