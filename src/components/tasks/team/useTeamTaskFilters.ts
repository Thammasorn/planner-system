'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { TASK_VIEWS, type TaskView } from '@/lib/schemas/preferences'
import {
  teamTasksQueryFromSearchParams,
  teamTasksQuerySchema,
  teamTasksSearchParams,
  type TeamTasksQuery,
} from '@/lib/schemas/tasks'

/** Every /tasks filter in one object (M3-D41; parsed form — booleans, not URL strings), incl. M8's `milestoneId`. */
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
    ...(f.milestoneId ? { milestoneId: f.milestoneId } : {}),
    ...(cursor ? { cursor } : {}),
  })
}

/** M11.4: `?view=list|board|table|calendar` (lowercase in the URL; wins over the stored `tasks.view`). */
export function parseTeamView(sp: URLSearchParams): TaskView | undefined {
  const raw = sp.get('view')?.toUpperCase()
  return TASK_VIEWS.find((v) => v === raw)
}

/** The page URL for these filters + view; other params (`?task=` of the panel) are kept. */
export function teamTasksUrl(f: TeamTaskFilters, view: TaskView | undefined, current: URL): string {
  const qs = teamFiltersToSearchParams(f)
  if (view) qs.set('view', view.toLowerCase())
  const task = current.searchParams.get('task')
  if (task) qs.set('task', task)
  const s = qs.toString()
  return `${current.pathname}${s ? `?${s}` : ''}${current.hash}`
}

/**
 * /tasks filter state (M3-D33/D41): read from the URL once on mount, mirrored with history.replaceState only when
 * `syncUrl` (M9's person tab passes false), never stored in preferences. Changing the project clears `milestoneId`
 * (a milestone belongs to one project, M8-D15).
 */
export function useTeamTaskFilters({ syncUrl }: { syncUrl: boolean }) {
  const sp = useSearchParams()
  const [filters, setFiltersState] = useState<TeamTaskFilters>(() =>
    syncUrl ? parseTeamFilters(new URLSearchParams(sp.toString())) : EMPTY_TEAM_FILTERS,
  )
  const [view, setViewState] = useState<TaskView | undefined>(() =>
    syncUrl ? parseTeamView(new URLSearchParams(sp.toString())) : undefined,
  )
  const write = (f: TeamTaskFilters, v: TaskView | undefined) => {
    if (syncUrl) window.history.replaceState(null, '', teamTasksUrl(f, v, new URL(window.location.href)))
  }
  const setFilters = (next: TeamTaskFilters) => {
    setFiltersState(next)
    write(next, view)
  }
  /** M11.4: the chosen view, mirrored in the URL (the caller also saves `tasks.view`). */
  const setView = (v: TaskView) => {
    setViewState(v)
    write(filters, v)
  }
  const patch = (p: Partial<TeamTaskFilters>) => {
    const projectChanged = 'projectId' in p && p.projectId !== filters.projectId
    setFilters({ ...filters, ...p, ...(projectChanged ? { milestoneId: undefined } : {}) })
  }
  const clear = () => setFilters(EMPTY_TEAM_FILTERS)
  return { filters, setFilters, patch, clear, view, setView }
}
