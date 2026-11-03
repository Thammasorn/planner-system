// src/lib/contracts/search.ts — `GET /api/search` (FR-1102…1105, M4-D19). M6.1 adds the `tasks` group (FR-690,
// M6.1-D14); M10 adds projects/people/clients keys to SearchResponse additively (X88) and the index DTOs (M10-D21).
import type { ProjectAccessRole } from './projects'
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

/** M10 (FR-1102, M10-D20/D35). `href` = `/projects/<id>`. Archived projects of the viewer are included (chip). */
export interface ProjectSearchHit {
  kind: 'project'
  id: string
  name: string
  color: string
  archived: boolean
  tentative: boolean
  href: string
}

/** M10: visible people only (visibleUserIds); deactivated people are labelled. `href` = `/people/<id>`. */
export interface PersonSearchHit {
  kind: 'person'
  id: string
  name: string
  nickname: string | null
  positionName: string | null
  active: boolean
  href: string
}

/** M10 (PERM-04): managers all clients, others clients of visible projects. `href` = `/clients/<id>`. */
export interface ClientSearchHit {
  kind: 'client'
  id: string
  name: string
  archived: boolean
  href: string
}

/** GET /api/search as consumed by M4/M6.1 code (mention menu, M4 tests): pages + tasks. */
export interface SearchResponse {
  pages: PageSearchHit[]
  /** FR-690 (M6.1). The route always sends it (`[]` with `titleOnly`). */
  tasks: TaskSearchHit[]
}

/**
 * GET /api/search from M10 (FR-1102…1105, M10-D20): all five categories, ≤ 8 each, visibility in SQL (FR-1104);
 * `[]` for a category with no hit and for everything but `pages` with `titleOnly`. A superset of SearchResponse, so
 * M4/M6.1 consumers keep compiling (a separate name because existing tests spread `Required<SearchResponse>`).
 */
export interface SearchAllResponse extends SearchResponse {
  projects: ProjectSearchHit[]
  people: PersonSearchHit[]
  clients: ClientSearchHit[]
  /** M11 (FR-1474, M11-D28): the "ฐานข้อมูล" group, after M10's groups (X88); `[]` with `titleOnly`. */
  databases: DatabaseSearchHit[]
}

/** M11-D28: a database title, row title or row body hit (≤ 8); visibility of the owner page in SQL (FR-1104).
 *  `pageTitle` = owner title (TASK owner: the task name); `href` per M11-D26 (`/p/<page>?db=&row=` or `/t/<task>?db=&row=`). */
export interface DatabaseSearchHit {
  kind: 'database'
  rowId: string | null
  databaseId: string
  pageId: string
  rowTitle: string | null
  databaseTitle: string
  pageTitle: string
  /** Nested databases (FR-1453 rev. 2026-11-03): the outer databases and rows between the root page and this
   *  database, outermost first (empty at level 1). `pageId` is the immediate owner (a row body when nested),
   *  `pageTitle` the root page's; `href` is `/r/<outer row>?db=&row=` when nested. */
  trail: { kind: 'database' | 'row'; title: string }[]
  matchedIn: 'database' | 'row' | 'content'
  href: string
}
export type SearchCategory = keyof SearchAllResponse
/** FR-1102 order. */
export const SEARCH_CATEGORIES: readonly SearchCategory[] = [
  'projects',
  'tasks',
  'pages',
  'people',
  'clients',
]

// ── GET /api/search/index — the palette's local index (M10-D21) ──

export interface SearchIndexProject {
  id: string
  name: string
  color: string
  archived: boolean
  tentative: boolean
  /** Viewer's effective role (M2-D17) → the create-task picker (non-archived M/L/Me, X42). */
  role: ProjectAccessRole
}
export interface SearchIndexPerson {
  id: string
  name: string
  nickname: string | null
  positionName: string | null
  active: boolean
}
export interface SearchIndexClient {
  id: string
  name: string
  archived: boolean
}
export interface SearchIndexResponse {
  projects: SearchIndexProject[]
  people: SearchIndexPerson[]
  clients: SearchIndexClient[]
}
