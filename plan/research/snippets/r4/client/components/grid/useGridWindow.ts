'use client'
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueries,
  type InfiniteData,
} from '@tanstack/react-query'
import { addDays, type GridResponse, type ISODate } from './grid-types'

const CHUNK_WEEKS = 8

async function fetchGrid(
  projectId: string,
  from: ISODate,
  expand: readonly ISODate[],
  signal: AbortSignal,
): Promise<GridResponse> {
  const to = addDays(from, CHUNK_WEEKS * 7)
  const qs = new URLSearchParams({ from, to })
  if (expand.length) qs.set('expand', expand.join(','))
  const res = await fetch(`/api/grid/project/${projectId}?${qs.toString()}`, { signal })
  if (!res.ok) throw new Error(`grid ${res.status}`)
  return (await res.json()) as GridResponse
}

export const gridKeys = {
  all: ['grid'] as const,
  project: (projectId: string) => ['grid', 'project', projectId] as const,
  chunk: (projectId: string, from: ISODate, expand: readonly ISODate[]) =>
    ['grid', 'project', projectId, { from, expand }] as const,
}

// ---------------------------------------------------------------------------
// Option A — bidirectional useInfiniteQuery (API verified against @tanstack/query-core 5.104 d.ts)
// ---------------------------------------------------------------------------
export function useGridInfinite(projectId: string, todayChunk: ISODate, expand: readonly ISODate[]) {
  return useInfiniteQuery<
    GridResponse,
    Error,
    InfiniteData<GridResponse, ISODate>,
    readonly unknown[],
    ISODate
  >({
    queryKey: [...gridKeys.project(projectId), 'infinite', { expand }],
    queryFn: ({ pageParam, signal }) => fetchGrid(projectId, pageParam, expand, signal),
    initialPageParam: todayChunk,
    getNextPageParam: (_last, _all, lastPageParam) => addDays(lastPageParam, CHUNK_WEEKS * 7),
    getPreviousPageParam: (_first, _all, firstPageParam) => addDays(firstPageParam, -CHUNK_WEEKS * 7),
    // keep at most 6 chunks (48 weeks) in memory; fetching past it drops pages from the other end
    maxPages: 6,
    placeholderData: keepPreviousData, // toggling `expand` keeps old columns until new data lands
  })
  // usage: q.fetchNextPage(), q.fetchPreviousPage(), q.hasPreviousPage, q.isFetchingPreviousPage
  // CAVEAT (verified in infiniteQueryBehavior.js): a refetch/invalidate re-runs ALL pages
  // sequentially starting from pageParams[0] — N serial requests.
}

// ---------------------------------------------------------------------------
// Option B (recommended) — independent chunk queries; window = [firstChunk, lastChunk]
// ---------------------------------------------------------------------------
export function useGridChunks(projectId: string, chunkStarts: readonly ISODate[], expand: readonly ISODate[]) {
  return useQueries({
    queries: chunkStarts.map((from) => ({
      queryKey: gridKeys.chunk(projectId, from, expand),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchGrid(projectId, from, expand, signal),
      placeholderData: keepPreviousData,
    })),
    combine: (results) => ({
      chunks: results.map((r) => r.data),
      isFetching: results.some((r) => r.isFetching),
      isError: results.some((r) => r.isError),
    }),
  })
}
