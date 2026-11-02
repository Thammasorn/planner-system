'use client'
// src/components/editor/PageEditorContext.tsx — what the custom blocks need from the page editor around them (M10
// live blocks FR-1301/1303; M11 database island + equations, EditorPageContext of plan/m11 S5.1): the page id (the
// blocks never store it, M10-D4), whether the editor is editable now (node views are not re-rendered when only the
// editable flag changes, M10-D7/D31), and for M11 the page kind, the page permission (database data is editable
// whenever the viewer may edit the page — not tied to the lease, FR-1462), `getPageId` (a task body creates its row
// first) and the variant (a compact task-panel body opens rows as /r pages, M11-D26).
import { createContext, useContext } from 'react'
import type { PageKind } from '@/lib/contracts/pages'

export interface PageEditorContextValue {
  /** null while a task body has no row yet (M6.1-D8). */
  pageId: string | null
  editable: boolean
  /** M11. Default 'DOC'. */
  kind?: PageKind
  /** M11 (FR-1462): the viewer may edit the page (independent of the lease). Default = `editable`. */
  canEdit?: boolean
  /** M11: known id, or ensure the row of a task body first (memoised; rejects after a toasted failure). */
  getPageId?: () => Promise<string>
  /** M11-D26: 'compact' = the task panel body. Default 'page'. */
  variant?: 'page' | 'compact'
}

export const PageEditorContext = createContext<PageEditorContextValue | null>(null)

/** The surrounding page editor, or null (headless use, tests). */
export function usePageEditor(): PageEditorContextValue | null {
  return useContext(PageEditorContext)
}

/** The id of the page being edited, or null when there is none (yet). */
export function usePageId(): string | null {
  return useContext(PageEditorContext)?.pageId ?? null
}
