// src/lib/contracts/sidebar.ts — `GET /api/sidebar` (SPEC §8.1, M2-D08). Later milestones add fields (M3 my-task count).
import type { Certainty } from '@/domain/types'

/** Visible, non-archived project in the sidebar (sorted with compareThai). */
export interface SidebarProject {
  id: string
  name: string
  color: string
  certainty: Certainty
}

export interface SidebarResponse {
  projects: SidebarProject[]
  /** The viewer can see at least one archived project (shows the "ดูโปรเจคที่ archive" link). */
  hasArchived: boolean
  canCreateProject: boolean
  /** M3 (X22): number of tasks on /my (open assigned leaf tasks in non-archived projects); M9 redefines it. */
  myTaskCount: number
}
