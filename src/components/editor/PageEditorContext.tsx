'use client'
// src/components/editor/PageEditorContext.tsx — what the live blocks (M10, FR-1301/1303) need from the page editor
// around them: the page id (the blocks never store it, M10-D4) and whether the editor is editable now (the config
// toolbar, M10-D7/D31 — node views are not re-rendered when only the editable flag changes).
import { createContext, useContext } from 'react'

export interface PageEditorContextValue {
  /** null while a task body has no row yet (M6.1-D8). */
  pageId: string | null
  editable: boolean
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
