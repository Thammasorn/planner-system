// src/lib/nav/task-href.ts — URLs of a task (FR-683/685, M6.1-D17). Isomorphic.

/** The task page `/t/<id>` (↗, Shift+Space, Cmd+K task hits). */
export const taskPageHref = (taskId: string): string => `/t/${taskId}`

/** The project's งาน tab, optionally with the task panel open (`?task=`, M3-D17). */
export const projectTasksHref = (projectId: string, taskId?: string): string =>
  taskId === undefined ? `/projects/${projectId}/tasks` : `/projects/${projectId}/tasks?task=${taskId}`

/** A plain primary click (no modifier, left button) — the ones that stay in this tab. */
export function isPlainClick(e: {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}
