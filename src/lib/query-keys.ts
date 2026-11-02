// src/lib/query-keys.ts — the only place TanStack Query keys are built (PLAN.md §3.5). Each milestone registers its
// queries here (M2: sidebar, people options, client options · M3: tasks, statuses, team tasks) and its invalidation
// groups in src/lib/invalidate.ts.
import type { ISODate } from '@/domain/types'
import type { PageSpace } from '@/lib/contracts/pages'
import type { WorkloadParams } from '@/lib/contracts/workload'
import type { TeamTasksQuery } from '@/lib/schemas/tasks'

/** Planning-grid context (PLAN §3.5, M6): a project grid (M6) or a person grid (M9). */
export type GridCtx = { kind: 'project'; id: string } | { kind: 'person'; id: string }
/** One 8-week chunk query of a grid (X65): `from` = the chunk's Monday; M7 fills `expand`/`zoom: 'DAY'`. */
export type GridChunk = { from: ISODate; expand: ISODate[]; zoom: 'WEEK' | 'DAY'; includeOthers: boolean }

export const qk = {
  sidebar: () => ['sidebar'] as const,
  peopleOptions: () => ['people', 'options'] as const,
  clientOptions: (projectId: string | null) => ['clients', 'options', projectId] as const,
  /** GET /api/projects/[id]/tasks (M3). */
  projectTasks: (projectId: string) => ['tasks', 'project', projectId] as const,
  /** GET /api/tasks/my (M3, X22). */
  myTasks: () => ['tasks', 'my'] as const,
  /** GET /api/projects/[id]/statuses (M3, v3.1). */
  projectStatuses: (projectId: string) => ['projects', projectId, 'statuses'] as const,
  /** Prefix of every /tasks page query (M3, v3.1). */
  teamTasksAll: () => ['tasks', 'team'] as const,
  /** GET /api/tasks with the parsed filters (M3, v3.1, X75). */
  teamTasks: (filters: TeamTasksQuery) => ['tasks', 'team', filters] as const,
  /** GET /api/tasks/[id]/body — the task body view (M6.1-D7). Under 'tasks' but never invalidated by task writes. */
  taskBody: (taskId: string) => ['tasks', 'body', taskId] as const,
  /** GET /api/pages/tree — children of one node (parentId) or the space root (null) (M4). */
  pagesTree: (space: PageSpace, projectId: string | null, parentId: string | null) =>
    ['pages', 'tree', space, projectId, parentId] as const,
  /** Prefix of every tree query of one space / project (M4-D36). */
  pagesTreeScope: (space: PageSpace, projectId: string | null) =>
    ['pages', 'tree', space, projectId] as const,
  /** GET /api/pages/[id] (M4). */
  page: (pageId: string) => ['pages', 'one', pageId] as const,
  /** GET /api/pages/[id]/lock (M4-D3). */
  pageLease: (pageId: string) => ['pages', 'lease', pageId] as const,
  /** GET /api/pages/titles?ids= — ids sorted so the same set shares one cache entry (M4-D20). */
  pageTitles: (ids: readonly string[]) => ['pages', 'titles', [...ids].sort()] as const,
  /** GET /api/search (M4 pages; M10 adds categories, X82). `scope: 'title'` = titleOnly (mention menu). */
  search: (q: string, scope: 'all' | 'title' = 'all') => ['search', q, scope] as const,
  /** GET /api/calendar?from&to — Mondays, `to` exclusive (M5-D8). */
  calendar: (from: ISODate, to: ISODate) => ['calendar', from, to] as const,
  /** GET /api/leave-types — active types for the leave dialog (M5-D9). */
  leaveTypes: () => ['leaveTypes'] as const,
  /** Prefix of every chunk of one grid — the optimistic overlay patches through setQueriesData (M6). */
  gridAll: (ctx: GridCtx) => ['grid', ctx.kind, ctx.id] as const,
  /** GET /api/grid/project/[id]?from&to&includeOthers — one 8-week chunk (M6; person grid M9). */
  gridChunk: (ctx: GridCtx, c: GridChunk) => ['grid', ctx.kind, ctx.id, c] as const,
  /** GET /api/projects/[id]/plan-markers — every live marker of a project, shared by grid, calendar and chart (M7.1-D15). */
  planMarkers: (projectId: string) => ['planMarkers', projectId] as const,
  /** GET /api/projects/[id]/milestones — live milestones with status, lateness and progress (M8-D17, X82). */
  projectMilestones: (projectId: string) => ['projects', projectId, 'milestones'] as const,
  /** GET /api/milestones/targets — projects where the viewer may create a milestone (palette, M8-D18). */
  milestoneTargets: () => ['milestones', 'targets'] as const,
  // ── M9 (PLAN §3.5, X82, M9-D22): everything under ['workload'] (or ['calendar']) so invalidateLoad /
  // invalidateCalendar reach it (X18). ──
  /** GET /api/workload with the parsed filters + default window (M9-D2). */
  workload: (p: WorkloadParams) => ['workload', 'table', p] as const,
  /** GET /api/workload/cell?userId&week (M9-D9). */
  workloadCell: (userId: string, week: ISODate) => ['workload', 'cell', userId, week] as const,
  /** GET /api/workload/badge — the sidebar ●N (M9-D11). */
  workloadBadge: () => ['workload', 'badge'] as const,
  /** GET /api/people — the ทีมงาน directory (M9-D14). */
  peopleDirectory: () => ['workload', 'people'] as const,
  /** GET /api/projects/[id]/load — overview load section (M9-D19). */
  projectLoad: (projectId: string) => ['workload', 'project', projectId] as const,
  /** GET /api/clients/[id]/load — client page load (M9-D20). */
  clientLoad: (clientId: string) => ['workload', 'client', clientId] as const,
  /** GET /api/people/[userId]/time-off — person page วันลา tab (M9-D16); under ['calendar']. */
  personTimeOff: (userId: string) => ['calendar', 'person', userId] as const,
  // ── M10 (PLAN §3.5, X82, M10-D10/D21) ──
  /** GET /api/home — the whole dashboard (M10-D34); invalidated by invalidateTasks / invalidateLoad / invalidateMilestones. */
  home: () => ['home'] as const,
  /** GET /api/search/index — the palette's local index (M10-D21); under ['search'] so invalidatePages refreshes it. */
  searchIndex: () => ['search', 'index'] as const,
  /** GET /api/pages/[id]/embed/tasks — a taskView block (M10-D2). */
  pageEmbedTasks: (pageId: string) => ['embed', 'tasks', pageId] as const,
  /** Prefix of every taskView block query (invalidateTasks). */
  pageEmbedTasksAll: () => ['embed', 'tasks'] as const,
  /** GET /api/pages/[id]/embed/workload — a projectWorkload block (M10-D11). */
  pageEmbedWorkload: (pageId: string) => ['embed', 'workload', pageId] as const,
  /** Prefix of every projectWorkload block query (invalidateLoad). */
  pageEmbedWorkloadAll: () => ['embed', 'workload'] as const,
  // ── M11 (plan/m11 S0.8, M11-D20): one cache entry per database, shared by every view, the row panel and /r ──
  /** GET /api/pages/[id]/databases/[databaseId] — the whole DatabaseResponse. */
  database: (pageId: string, databaseId: string) => ['databases', pageId, databaseId] as const,
  /** GET /api/database-rows/[id]/body — the row body view (M11-D8). */
  rowBody: (rowId: string) => ['databases', 'rowBody', rowId] as const,
}

/** Prefixes for load views (M6 grid = qk.gridAll(…) under ['grid'], M9 workload, M10 home). Invalidating an unused prefix is a no-op,
 *  so invalidateLoad is correct from M2 on. */
export const qkPrefix = {
  grid: ['grid'] as const,
  workload: ['workload'] as const,
  home: qk.home(),
  myTasks: qk.myTasks(),
  teamTasks: qk.teamTasksAll(),
  clientOptions: ['clients', 'options'] as const,
  pagesTree: ['pages', 'tree'] as const,
  pageTitles: ['pages', 'titles'] as const,
  /** Every search query, incl. M10's qk.searchIndex() = ['search', 'index'] (X82). */
  search: ['search'] as const,
  /** Every calendar range (M5). */
  calendar: ['calendar'] as const,
  leaveTypes: ['leaveTypes'] as const,
  /** M11: every database and row-body query. */
  databases: ['databases'] as const,
}
