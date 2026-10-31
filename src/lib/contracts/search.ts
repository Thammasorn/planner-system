// src/lib/contracts/search.ts — `GET /api/search` (FR-1102…1105, M4-D19). M10 adds projects/tasks/people/clients
// keys to SearchResponse additively (X88).

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

export interface SearchResponse {
  pages: PageSearchHit[]
}
