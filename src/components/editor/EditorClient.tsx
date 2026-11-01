'use client'
// src/components/editor/EditorClient.tsx — the page editor entry the page shell renders (PLAN §3.11). BlockNote needs
// `window`, so PageEditor is a client-only dynamic chunk (`ssr: false` is only allowed inside a Client Component,
// r3 §2). An error boundary keeps a crashing editor from unmounting the page.
import Skeleton from '@mui/material/Skeleton'
import dynamic from 'next/dynamic'
import type { JSX } from 'react'
import { EditorErrorBoundary } from './EditorErrorBoundary'
import type { PageEditorShellProps } from './PageEditor' // type-only: stays out of this chunk

/** Minimum height of the compact (task panel) body; mirrored in editor-theme.css (layout constant, not a token). */
export const COMPACT_MIN_HEIGHT = 120

// The import() must be written inside each dynamic() call (Next lazy-loading docs: preloading matches the call).
const PageEditor = dynamic(() => import('./PageEditor'), {
  ssr: false,
  loading: () => <Skeleton variant="rectangular" height={240} data-testid="editor-skeleton" />,
})
/** Same chunk; the skeleton matches the compact body's minimum height (screenshot-ready loading, M6.1-D2). */
const CompactPageEditor = dynamic(() => import('./PageEditor'), {
  ssr: false,
  loading: () => <Skeleton variant="rectangular" height={COMPACT_MIN_HEIGHT} data-testid="editor-skeleton" />,
})

export function EditorClient(props: PageEditorShellProps): JSX.Element {
  // M6.1-D8: keyed by the stable editor identity (DOC: the page id; TASK: 'task:<taskId>') so the instance survives
  // the lazy page id of a TASK body (pageId null → id). In-app navigation never reuses one page's editor state.
  const key = props.editorKey ?? props.pageId ?? ''
  return (
    <EditorErrorBoundary key={key}>
      {props.variant === 'compact' ? <CompactPageEditor {...props} /> : <PageEditor {...props} />}
    </EditorErrorBoundary>
  )
}
