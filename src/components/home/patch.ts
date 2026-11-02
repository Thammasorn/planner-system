// src/components/home/patch.ts — the optimistic tick of the home card "งานของฉันสัปดาห์นี้" (M10-D33). Pure.
import type { HomeResponse, HomeTaskItem } from '@/lib/contracts/home'

/** A home task as the client caches it: `completed` = ticked in this session (the server sends open tasks only). */
export type HomeTaskView = HomeTaskItem & { completed?: boolean }

/** HomeResponse in the TanStack cache (a superset: the optimistic `completed` flag). */
export type HomeCache = Omit<HomeResponse, 'myTasks'> & { myTasks: { items: HomeTaskView[]; more: number } }

/** Sets the session flag of one task; the same object when the task is not in the card. */
export function patchHomeTask(d: HomeCache, taskId: string, patch: { completed: boolean }): HomeCache {
  if (!d.myTasks.items.some((t) => t.id === taskId)) return d
  return {
    ...d,
    myTasks: {
      ...d.myTasks,
      items: d.myTasks.items.map((t) => (t.id === taskId ? { ...t, completed: patch.completed } : t)),
    },
  }
}
