'use client'
import { useQuery } from '@tanstack/react-query'
import { getJson } from '@/lib/api'
import type { PageSpace, PageTreeResponse } from '@/lib/contracts/pages'
import { qk } from '@/lib/query-keys'

/** `GET /api/pages/tree?space&projectId&parentId` — one level (lazy children, M4-D23). */
export function treeUrl(space: PageSpace, projectId: string | null, parentId: string | null): string {
  const p = new URLSearchParams({ space })
  if (projectId) p.set('projectId', projectId)
  if (parentId) p.set('parentId', parentId)
  return `/api/pages/tree?${p.toString()}`
}

export function treeQueryOptions(space: PageSpace, projectId: string | null, parentId: string | null) {
  return {
    queryKey: qk.pagesTree(space, projectId, parentId),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      getJson<PageTreeResponse>(treeUrl(space, projectId, parentId), { signal }),
  }
}

/** The root level of one space (shared by the sidebar, the project tab and the "+" buttons that need `canCreate`). */
export function usePageTreeRoots(space: PageSpace, projectId: string | null, enabled = true) {
  return useQuery({ ...treeQueryOptions(space, projectId, null), enabled })
}
