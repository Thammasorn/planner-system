// src/lib/contracts/row-pages.ts — isomorphic, type-only DTOs of database row bodies and the row page /r/[rowId]
// (SPEC §4.14 FR-1453, §7.7; plan/m11 S0.4, M11-D8/D27). Mirrors task-pages.ts (M6.1).
import type { UploadLimits } from '@/lib/files/upload-rules'
import type { PageSpace } from './pages'

/** The DB_ROW page row of a database row. `isBlank` = isBlankPage (no text, no media). */
export interface RowBodyPage {
  id: string
  version: number
  content: unknown[]
  fullWidth: boolean
  isBlank: boolean
}

/** `GET /api/database-rows/[id]/body`: `page: null` until the body is first edited. */
export interface RowBodyView {
  rowId: string
  databaseId: string
  ownerPageId: string
  /** Space / project of the owner page (= the body page's, M11-D8): the editor scopes uploads and mentions by them. */
  space: PageSpace
  projectId: string | null
  page: RowBodyPage | null
  /** edit = canEditDatabase(owner access) (archived → false, X42; locked wiki for workers → false). */
  can: { edit: boolean }
  uploadLimits: UploadLimits
  /** Nesting level of the row's database (1 = on a DOC / TASK page; FR-1453 / FR-1475 rev. 2026-11-03). */
  databaseLevel: number
  /** databaseLevel < DB_LIMITS.nestingLevels: the body may hold database blocks (slash items, paste). */
  canNestDatabase: boolean
}

/** Everything `/r/[rowId]` needs for its first paint (RSC loader `getRowPageView`, M11-D27). */
export interface RowPageView {
  row: { id: string; title: string; databaseId: string }
  database: { id: string; title: string; ownerPageId: string }
  owner: {
    /** DB_ROW: a nested database — its owner is the body of an outer row. */
    kind: 'DOC' | 'TASK' | 'DB_ROW'
    pageId: string
    /** DOC: page title; TASK: task name; DB_ROW: the outer row's title. */
    title: string
    /** DOC: `/p/<pageId>`; TASK: `/t/<taskId>`; DB_ROW: `/r/<outerRowId>`. */
    href: string
    projectId: string | null
    projectName: string | null
    archived: boolean
  }
  body: RowBodyView
}

/** `ensureRowBody` result (M11-D8): `created` = this call inserted the row (and wrote the `page · create` audit). */
export interface EnsureRowBodyResult {
  pageId: string
  version: number
  created: boolean
}
