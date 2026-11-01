'use client'
// src/components/grid/useGridChunks.ts — independent 8-week chunk queries for the visible range ± 1 chunk
// (PLAN §3.10, r4 §9 option B, X65). Each chunk is its own query; the optimistic overlay patches them all through
// setQueriesData(qk.gridAll(ctx)).
import { keepPreviousData, useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ISODate } from '@/domain/types'
import type { GridResponse } from '@/lib/contracts/grid'
import { fetchGridChunk } from '@/lib/grid/fetch'
import { mergeChunks, type GridModel } from '@/lib/grid/merge'
import { qk, type GridChunk, type GridCtx } from '@/lib/query-keys'

export interface GridChunksResult {
  model: GridModel | null
  isError: boolean
  isFetching: boolean
  /** true until the first chunk resolved */
  isLoading: boolean
  refetch: () => void
}

export function chunkOf(from: ISODate, includeOthers: boolean): GridChunk {
  return { from, expand: [], zoom: 'WEEK', includeOthers }
}

function combine(rs: UseQueryResult<GridResponse>[]) {
  return {
    data: rs.map((r) => r.data),
    isError: rs.some((r) => r.isError),
    isFetching: rs.some((r) => r.isFetching),
    refetchers: rs.map((r) => r.refetch),
  }
}

export function useGridChunks(
  ctx: GridCtx,
  chunkStarts: readonly ISODate[],
  includeOthers: boolean,
): GridChunksResult {
  const qc = useQueryClient()
  const res = useQueries({
    queries: chunkStarts.map((from) => {
      const chunk = chunkOf(from, includeOthers)
      return {
        queryKey: qk.gridChunk(ctx, chunk),
        queryFn: ({ signal }: { signal: AbortSignal }) => fetchGridChunk(ctx, chunk, signal),
        // useQueries creates a new observer per key, so keepPreviousData only helps refetches of the same key; while
        // the footer switch flips, the other variant of the same chunk stands in (no loading flash).
        placeholderData: (prev: GridResponse | undefined) =>
          keepPreviousData(prev) ??
          qc.getQueryData<GridResponse>(qk.gridChunk(ctx, chunkOf(from, !includeOthers))),
        staleTime: 60_000,
      }
    }),
    combine,
  })
  const model = useMemo(() => mergeChunks(res.data), [res.data])
  return {
    model,
    isError: res.isError,
    isFetching: res.isFetching,
    isLoading: model === null && !res.isError,
    refetch: () => {
      for (const r of res.refetchers) void r()
    },
  }
}
