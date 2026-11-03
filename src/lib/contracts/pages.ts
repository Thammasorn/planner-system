// src/lib/contracts/pages.ts — isomorphic, type-only page DTOs (FR-501…543, plan/m04 S0.10).
import type { UploadLimits } from '@/lib/files/upload-rules'
import type { BlockInput } from '@/lib/schemas/page-content'

export type PageSpace = 'WORKSPACE' | 'PROJECT'

/** SPEC §6.2 page_kind: DOC = a document in a tree; TASK = the 1:1 body of a task (M6.1); DB_ROW = the 1:1 body of a
 *  database row (M11, FR-1453). */
export type PageKind = 'DOC' | 'TASK' | 'DB_ROW'

/** Sidebar / project-tab tree row (lazy children per node, M4-D23). */
export interface PageTreeNode {
  id: string
  parentId: string | null
  title: string
  icon: string | null
  depth: number
  position: string
  hasChildren: boolean
  locked: boolean
  /** The page or an ancestor is protected (FR-510, M4-D24). */
  effectiveProtected: boolean
  isCharter: boolean
}

/** `canCreate` = the viewer may add children here (parentId given) / at the space root. */
export interface PageTreeResponse {
  nodes: PageTreeNode[]
  canCreate: boolean
}

export interface PageCrumb {
  id: string
  title: string
  icon: string | null
}

export interface PageCan {
  edit: boolean
  protect: boolean
  delete: boolean
  createChild: boolean
  move: boolean
  duplicate: boolean
}

export interface PageDTO {
  id: string
  space: PageSpace
  projectId: string | null
  projectName: string | null
  projectArchived: boolean
  parentId: string | null
  depth: number
  title: string
  icon: string | null
  cover: { fileId: string; url: string } | null
  isCharter: boolean
  locked: boolean
  effectiveProtected: boolean
  version: number
  content: unknown[]
  isBlank: boolean
  /** ISO timestamp. */
  updatedAt: string
  updatedBy: { id: string; name: string }
  // ── M6.1 (M6.1-D5).
  /** 'TASK' pages are task bodies: title = tasks.name, no breadcrumb, no tree actions. */
  kind: PageKind
  /** Set when kind = 'TASK'. */
  taskId: string | null
  /** M11 (M11-D8): set when kind = 'DB_ROW'. Optional until S2's getPageView sends it (then `string | null`). */
  rowId: string | null
  /** FR-1602: shared page property (every viewer sees the same width). */
  fullWidth: boolean
}

/** Everything `/p/[pageId]` needs (RSC) and `GET /api/pages/[id]` returns. */
export interface PageView {
  page: PageDTO
  breadcrumb: PageCrumb[]
  can: PageCan
  uploadLimits: UploadLimits
}

/** `GET /api/pages/titles` item: invisible pages reveal nothing but the requested id (M4-D20, M4-D32). */
export type PageTitleItem =
  | { id: string; visible: true; deleted: false; title: string; icon: string | null }
  | { id: string; visible: true; deleted: true }
  | { id: string; visible: false }

export interface PageTitlesResponse {
  items: PageTitleItem[]
}

export interface LeaseHolder {
  userId: string
  name: string
}

/** Edit lease (FR-540–542). `version` = current pages.version (viewers reload when it increases, M4-D3). */
export interface LeaseState {
  mine: boolean
  holder: LeaseHolder | null
  /** ISO timestamp. */
  expiresAt: string | null
  version: number
}

export interface SavePageResult {
  version: number
  lease: LeaseState
}

export interface CreatePageResult {
  page: PageTreeNode
  space: PageSpace
  projectId: string | null
  href: string
}

export interface MovePageResult {
  page: PageTreeNode
  space: PageSpace
  projectId: string | null
  fromParentId: string | null
}

export interface DuplicatePageResult {
  root: PageTreeNode
  count: number
  space: PageSpace
  projectId: string | null
}

export interface DeletePageResult {
  batch: string
  count: number
  title: string
  space: PageSpace
  projectId: string | null
  parentId: string | null
}

export interface RestorePageResult {
  restoredIds: string[]
  space: PageSpace
  projectId: string | null
}

export interface ApplyTemplateResult {
  version: number
  title: string
  icon: string | null
}

export interface PageEditorProps {
  /** null until the first edit of a TASK body (FR-681); DOC pages always have one. */
  pageId: string | null
  space: PageSpace
  projectId: string | null
  depth: number
  initialContent: unknown[]
  version: number
  canEdit: boolean
  uploadLimits: UploadLimits
  /** The page shell increments it after applyTemplate → the editor re-fetches and re-creates. */
  reloadToken: number
  // ── M6.1-D8. Optional with DOC defaults inside PageEditor (kind 'DOC', editorKey = pageId, leaseAcquire 'mount',
  //    variant 'page') so M4 call sites compile unchanged; S4 passes them explicitly.
  kind?: PageKind
  /** Stable identity of the editor instance (DOC: pageId; TASK: 'task:' + taskId) — never changes when the id arrives. */
  editorKey?: string
  /** TASK: creates the row (ensureTaskBody) — memoised by the editor. */
  ensurePageId?: () => Promise<string>
  /** DOC 'mount' (M4); TASK 'focus' (M6.1-D8). */
  leaseAcquire?: 'mount' | 'focus'
  variant?: 'page' | 'compact'
  /** DB_ROW: the row's database is below DB_LIMITS.nestingLevels — database blocks (slash items, paste, drop) are
   *  allowed (FR-1453 / FR-1475 rev. 2026-11-03). Default false. Ignored for DOC / TASK. */
  canNestDatabase?: boolean
}

/** `setPageFullWidth` result (M6.1-D15): `changed: false` = the value was already set (no audit row). */
export interface SetPageFullWidthResult {
  pageId: string
  fullWidth: boolean
  changed: boolean
}

/** Templates are partial BlockNote blocks (M4-D8). */
export type TemplateBlock = BlockInput
