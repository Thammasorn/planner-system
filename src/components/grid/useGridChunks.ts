'use client'
// src/components/grid/useGridChunks.ts — independent 8-week chunk queries for the visible range ± 1 chunk
// (PLAN §3.10, r4 §9 option B, X65). Each chunk is its own query; the optimistic overlay patches them all through
// setQueriesData(qk.gridAll(ctx)). M7 (M7-D24): each chunk key carries only the expanded weeks inside it
// (chunkParams), so expanding a week refetches one chunk; until it lands, any cached variant of the same chunk stands
// in (the expanded week shows placeholder day columns, aria-busy).
import { keepPreviousData, useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ISODate } from '@/domain/types'
import type { GridResponse } from '@/lib/contracts/grid'
import { chunkParams, type ExpansionState } from '@/lib/grid/expansion'
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

/** Any cached chunk of the same `from` (another expand / zoom / includeOthers variant), preferring this footer switch. */
function standIn(qc: ReturnType<typeof useQueryClient>, ctx: GridCtx, from: ISODate, includeOthers: boolean) {
  const all = qc.getQueriesData<GridResponse>({ queryKey: qk.gridAll(ctx) })
  let other: GridResponse | undefined
  for (const [key, data] of all) {
    const c = key[3] as GridChunk | undefined
    if (!data || !c || c.from !== from) continue
    if (c.includeOthers === includeOthers) return data
    other ??= data
  }
  return other
}

export function useGridChunks(
  ctx: GridCtx,
  chunkStarts: readonly ISODate[],
  includeOthers: boolean,
  expansion?: ExpansionState,
): GridChunksResult {
  const qc = useQueryClient()
  const res = useQueries({
    queries: chunkStarts.map((from) => {
      const chunk = expansion ? chunkParams(expansion, from, includeOthers) : chunkOf(from, includeOthers)
      return {
        queryKey: qk.gridChunk(ctx, chunk),
        queryFn: ({ signal }: { signal: AbortSignal }) => fetchGridChunk(ctx, chunk, signal),
        // useQueries creates a new observer per key, so keepPreviousData only helps refetches of the same key; while
        // the footer switch flips or a week expands, another variant of the same chunk stands in (no loading flash).
        placeholderData: (prev: GridResponse | undefined) =>
          keepPreviousData(prev) ?? standIn(qc, ctx, from, includeOthers),
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
