'use client'
// src/components/editor/EditorClient.tsx — the page editor entry the page shell renders (PLAN §3.11). BlockNote needs
// `window`, so PageEditor is a client-only dynamic chunk (`ssr: false` is only allowed inside a Client Component,
// r3 §2). An error boundary keeps a crashing editor from unmounting the page.
import Skeleton from '@mui/material/Skeleton'
import dynamic from 'next/dynamic'
import type { JSX } from 'react'
import { EditorErrorBoundary } from './EditorErrorBoundary'
import type { PageEditorShellProps } from './PageEditor' // type-only: stays out of this chunk

const PageEditor = dynamic(() => import('./PageEditor'), {
  ssr: false,
  loading: () => <Skeleton variant="rectangular" height={240} data-testid="editor-skeleton" />,
})

export function EditorClient(props: PageEditorShellProps): JSX.Element {
  return (
    // Keyed by page: in-app navigation between pages must never reuse one page's editor state for another.
    <EditorErrorBoundary key={props.pageId}>
      <PageEditor {...props} />
    </EditorErrorBoundary>
  )
}
