// src/lib/query-keys.ts — the only place TanStack Query keys are built (PLAN.md §3.5). Each milestone registers its
// queries here (M2: sidebar, people options, client options · M3: tasks, statuses, team tasks) and its invalidation
// groups in src/lib/invalidate.ts.
import type { PageSpace } from '@/lib/contracts/pages'
import type { TeamTasksQuery } from '@/lib/schemas/tasks'

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
}

/** Prefixes for views that arrive later (M6 grid, M9 workload, M10 home). Invalidating an unused prefix is a no-op,
 *  so invalidateLoad is correct from M2 on. */
export const qkPrefix = {
  grid: ['grid'] as const,
  workload: ['workload'] as const,
  home: ['home'] as const,
  myTasks: qk.myTasks(),
  teamTasks: qk.teamTasksAll(),
  clientOptions: ['clients', 'options'] as const,
  pagesTree: ['pages', 'tree'] as const,
  pageTitles: ['pages', 'titles'] as const,
  /** Every search query, incl. M10's qk.searchIndex() = ['search', 'index'] (X82). */
  search: ['search'] as const,
}
