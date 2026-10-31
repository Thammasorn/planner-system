// src/lib/query-keys.ts — the only place TanStack Query keys are built (PLAN.md §3.5). Each milestone registers its
// queries here (M2: sidebar, people options, client options) and its invalidation groups in src/lib/invalidate.ts.

export const qk = {
  sidebar: () => ['sidebar'] as const,
  peopleOptions: () => ['people', 'options'] as const,
  clientOptions: (projectId: string | null) => ['clients', 'options', projectId] as const,
}

/** Prefixes for views that arrive later (M3 tasks.my, M6 grid, M9 workload, M10 home). Invalidating an unused prefix
 *  is a no-op, so invalidateLoad is correct from M2 on. */
export const qkPrefix = {
  grid: ['grid'] as const,
  workload: ['workload'] as const,
  home: ['home'] as const,
  myTasks: ['tasks', 'my'] as const,
  clientOptions: ['clients', 'options'] as const,
}
