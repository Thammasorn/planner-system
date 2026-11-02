'use client'
// src/components/database/data/useDatabase.ts — the one query of a database (FR-1401, FR-1463, M11-D20): every view,
// the row panel and /r share `qk.database(pageId, databaseId)`, so an edit in one shows in all at once. Fresh on mount
// and on focus (FR-1463 "refetch on focus"); a 404 (foreign / missing / invisible, FR-1464) is final — no retry.
import { useQuery } from '@tanstack/react-query'
import { ApiError, getJson } from '@/lib/api'
import type { DatabaseResponse } from '@/lib/contracts/databases'
import { qk } from '@/lib/query-keys'

export const databaseUrl = (pageId: string, databaseId: string): string =>
  `/api/pages/${encodeURIComponent(pageId)}/databases/${encodeURIComponent(databaseId)}`

export function isNotFoundError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404
}

export function useDatabase(pageId: string | null, databaseId: string) {
  const enabled = pageId !== null && databaseId !== ''
  return useQuery({
    queryKey: qk.database(pageId ?? '', databaseId),
    queryFn: ({ signal }) => getJson<DatabaseResponse>(databaseUrl(pageId ?? '', databaseId), { signal }),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
    retry: (count, err) => !isNotFoundError(err) && count < 1,
  })
}
