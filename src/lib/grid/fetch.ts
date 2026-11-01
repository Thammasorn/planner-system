// src/lib/grid/fetch.ts — one 8-week grid chunk over the route handler (PLAN §3.10, X65, X83, M7-D17).
import { addWeeks } from '@/domain/dates'
import { getJson } from '@/lib/api'
import type { GridResponse } from '@/lib/contracts/grid'
import type { GridChunk, GridCtx } from '@/lib/query-keys'
import { CHUNK_WEEKS } from './columns'

/**
 * URL mapping pinned here: GridChunk.zoom 'WEEK'|'DAY' → zoom=week|day (omitted when 'WEEK'); expand[] → comma list
 * (omitted when empty); includeOthers → '1' (omitted when false); to = from + 8 weeks (exclusive).
 */
export function gridChunkUrl(ctx: GridCtx, chunk: GridChunk): string {
  const qs = new URLSearchParams({ from: chunk.from, to: addWeeks(chunk.from, CHUNK_WEEKS) })
  if (chunk.includeOthers) qs.set('includeOthers', '1')
  if (chunk.expand.length > 0) qs.set('expand', chunk.expand.join(','))
  if (chunk.zoom === 'DAY') qs.set('zoom', 'day')
  // URLSearchParams encodes ',' — keep the comma list readable (dates contain no reserved characters)
  return `/api/grid/${ctx.kind}/${encodeURIComponent(ctx.id)}?${qs.toString().replaceAll('%2C', ',')}`
}

/** Non-2xx → throws ApiError (src/lib/api.ts). */
export function fetchGridChunk(ctx: GridCtx, chunk: GridChunk, signal: AbortSignal): Promise<GridResponse> {
  return getJson<GridResponse>(gridChunkUrl(ctx, chunk), { signal })
}
