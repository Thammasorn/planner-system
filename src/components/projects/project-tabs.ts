// src/components/projects/project-tabs.ts — the project page tab bar and the sidebar sub-links (FR-408, M2-D10).
// Data only. Later milestones append one entry each: M6 'plan' (order 1), M3 'tasks' (order 2), M4 'pages' (order 3).
import { th } from '@/i18n/th'

export type ProjectTabId = 'overview' | 'tasks' // M4 'pages', M6 'plan'

/** order is the fixed X84 / M2-D10 scale — overview 0 · plan 1 (M6) · tasks 2 (M3) · pages 3 (M4); never other values. */
export interface ProjectTab {
  id: ProjectTabId
  order: number
  label: string
}

export const PROJECT_TABS: readonly ProjectTab[] = [
  { id: 'overview', order: 0, label: th.projects.tabs.overview },
  { id: 'tasks', order: 2, label: th.projects.tabs.tasks }, // M3 (X15, M3-D40)
]

/** Tabs in FR-408 order. */
export const sortedProjectTabs = (): ProjectTab[] => [...PROJECT_TABS].sort((a, b) => a.order - b.order)

export const projectTabHref = (projectId: string, tab: ProjectTabId): string =>
  `/projects/${projectId}/${tab}`
