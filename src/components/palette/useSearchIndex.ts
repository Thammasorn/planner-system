'use client'
// src/components/palette/useSearchIndex.ts — the palette's local index (M10-D21, NFR-06): the viewer's visible projects,
// people and clients from GET /api/search/index, matched synchronously on every keystroke (first result < 200 ms).
import { useMemo } from 'react'
import { noop, useQuery, type QueryClient } from '@tanstack/react-query'
import { getJson } from '@/lib/api'
import type { SearchIndexResponse } from '@/lib/contracts/search'
import { qk } from '@/lib/query-keys'
import { matchLocal } from '@/lib/search/match'
import type { LocalMatches } from './groups'

const STALE_MS = 60_000

const indexQuery = {
  queryKey: qk.searchIndex(),
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    getJson<SearchIndexResponse>('/api/search/index', { signal }),
  staleTime: STALE_MS,
} as const

export function useSearchIndex() {
  return useQuery(indexQuery)
}

/** Warms the index once the shell is up (PaletteProvider, idle). */
export function prefetchSearchIndex(qc: QueryClient): Promise<void> {
  // a failed warm-up is not an error: the palette refetches on open and falls back to the server categories
  return qc.query(indexQuery).then(noop, noop)
}

/** Projects / people / clients of the index matching `q` (≤ 8 each); undefined while the index is unusable. */
export function useLocalMatches(index: SearchIndexResponse | undefined, q: string): LocalMatches | undefined {
  return useMemo(() => {
    if (
      !index ||
      !Array.isArray(index.projects) ||
      !Array.isArray(index.people) ||
      !Array.isArray(index.clients)
    )
      return undefined
    if (q === '') return { projects: [], people: [], clients: [] }
    return {
      projects: matchLocal(
        index.projects.map((p) => ({ ...p, keys: [p.name] })),
        q,
      ),
      people: matchLocal(
        index.people.map((p) => ({
          ...p,
          keys: [p.name, p.nickname ?? '', p.positionName ?? ''],
        })),
        q,
      ),
      clients: matchLocal(
        index.clients.map((c) => ({ ...c, keys: [c.name] })),
        q,
      ),
    }
  }, [index, q])
}
