'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  teamTasksQueryFromSearchParams,
  teamTasksQuerySchema,
  teamTasksSearchParams,
  type TeamTasksQuery,
} from '@/lib/schemas/tasks'

/** Every /tasks filter in one object (M3-D41; parsed form — booleans, not URL strings). M8 adds `milestoneId`. */
export type TeamTaskFilters = Omit<TeamTasksQuery, 'cursor'>

export const EMPTY_TEAM_FILTERS: TeamTaskFilters = { blocked: false, includeDone: false }

export function parseTeamFilters(sp: URLSearchParams): TeamTaskFilters {
  const r = teamTasksQuerySchema.safeParse(teamTasksQueryFromSearchParams(sp))
  if (!r.success) return EMPTY_TEAM_FILTERS
  const { cursor: _cursor, ...rest } = r.data
  return rest
}

/** The URL / request form (defaults omitted). */
export function teamFiltersToSearchParams(f: TeamTaskFilters, cursor?: string): URLSearchParams {
  return teamTasksSearchParams({
    ...(f.projectId ? { projectId: f.projectId } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.positionId ? { positionId: f.positionId } : {}),
    ...(f.category && f.category.length > 0 ? { category: f.category } : {}),
    ...(f.blocked ? { blocked: 'true' } : {}),
    ...(f.includeDone ? { includeDone: 'true' } : {}),
    ...(cursor ? { cursor } : {}),
  })
}

/**
 * /tasks filter state (M3-D33/D41): read from the URL once on mount, mirrored with history.replaceState only when
 * `syncUrl` (M9's person tab passes false), never stored in preferences.
 */
export function useTeamTaskFilters({ syncUrl }: { syncUrl: boolean }) {
  const sp = useSearchParams()
  const [filters, setFiltersState] = useState<TeamTaskFilters>(() =>
    syncUrl ? parseTeamFilters(new URLSearchParams(sp.toString())) : EMPTY_TEAM_FILTERS,
  )
  const setFilters = (next: TeamTaskFilters) => {
    setFiltersState(next)
    if (!syncUrl) return
    const qs = teamFiltersToSearchParams(next).toString()
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
    )
  }
  const patch = (p: Partial<TeamTaskFilters>) => setFilters({ ...filters, ...p })
  const clear = () => setFilters(EMPTY_TEAM_FILTERS)
  return { filters, setFilters, patch, clear }
}
