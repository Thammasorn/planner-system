// src/lib/contracts/search.ts — `GET /api/search` (FR-1102…1105, M4-D19). M6.1 adds the `tasks` group (FR-690,
// M6.1-D14); M10 adds projects/people/clients keys to SearchResponse additively (X88).
import type { StatusRef } from './tasks'

export interface PageSearchHit {
  kind: 'page'
  id: string
  title: string
  icon: string | null
  href: string
  /** Project name, or th.palette.wiki for the team wiki. */
  subtitle: string
  matchedIn: 'title' | 'content'
}

/** M10's shape + `matchedIn` (M6.1-D14). `href` = `/t/<id>`. Only tasks of live projects the viewer can see. */
export interface TaskSearchHit {
  kind: 'task'
  id: string
  name: string
  projectId: string
  projectName: string
  projectArchived: boolean
  status: StatusRef
  completed: boolean
  href: string
  matchedIn: 'name' | 'content'
}

export interface SearchResponse {
  pages: PageSearchHit[]
  /** FR-690 (M6.1). The route always sends it (`[]` with `titleOnly`). */
  tasks: TaskSearchHit[]
}
