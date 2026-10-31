// src/lib/contracts/pages.ts — isomorphic, type-only page DTOs (FR-501…543, plan/m04 S0.10).
import type { UploadLimits } from '@/lib/files/upload-rules'
import type { BlockInput } from '@/lib/schemas/page-content'

export type PageSpace = 'WORKSPACE' | 'PROJECT'

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
  pageId: string
  space: PageSpace
  projectId: string | null
  depth: number
  initialContent: unknown[]
  version: number
  canEdit: boolean
  uploadLimits: UploadLimits
  /** The page shell increments it after applyTemplate → the editor re-fetches and re-creates. */
  reloadToken: number
}

/** Templates are partial BlockNote blocks (M4-D8). */
export type TemplateBlock = BlockInput
