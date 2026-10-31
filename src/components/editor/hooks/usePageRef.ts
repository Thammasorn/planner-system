'use client'
// src/components/editor/hooks/usePageRef.ts — live title/icon of a page referenced from content (sub-page card,
// page mention; FR-528/529, M4-D20/D32). Titles are never stored in the document; invisible pages reveal nothing.
import { useQuery } from '@tanstack/react-query'
import { getJson } from '@/lib/api'
import type { PageTitlesResponse } from '@/lib/contracts/pages'
import { qk } from '@/lib/query-keys'

export type PageRef =
  | { status: 'creating' | 'loading' | 'deleted' | 'noAccess' }
  | { status: 'ok'; title: string; icon: string | null }

export function usePageRef(pageId: string): PageRef {
  const q = useQuery({
    queryKey: qk.pageTitles([pageId]),
    queryFn: ({ signal }) =>
      getJson<PageTitlesResponse>(`/api/pages/titles?ids=${encodeURIComponent(pageId)}`, { signal }),
    enabled: pageId !== '',
    staleTime: 30_000,
  })
  if (pageId === '') return { status: 'creating' }
  // A failed lookup (malformed id → 400, network) must not spin forever nor reveal anything.
  if (q.isError) return { status: 'noAccess' }
  if (!q.data) return { status: 'loading' }
  const item = q.data.items.find((i) => i.id === pageId)
  if (!item || !item.visible) return { status: 'noAccess' }
  if (item.deleted) return { status: 'deleted' }
  return { status: 'ok', title: item.title, icon: item.icon }
}
