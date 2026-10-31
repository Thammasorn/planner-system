'use client'
// src/components/editor/blocks/subpage.tsx — sub-page link card (FR-528, SPEC §7.7, M4-D14). props: { pageId }.
// From plan/research/snippets/r3/harness/src/blocks/subpage.tsx with TanStack Query (usePageRef) instead of the
// harness store. Title/icon are NOT stored in the document: renames show everywhere, deleted / invisible pages show
// a text state (never colour only), and a card never leaks the title of a page the viewer cannot see.
import { createReactBlockSpec } from '@blocknote/react'
import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { th } from '@/i18n/th'
import { usePageRef } from '../hooks/usePageRef'

const DEFAULT_ICON = '📄'

export function SubpageCard({ pageId }: { pageId: string }): JSX.Element {
  const ref = usePageRef(pageId)
  const router = useRouter()
  const t = th.editor.subpage
  const ok = ref.status === 'ok'
  const label =
    ref.status === 'ok'
      ? ref.title || t.untitled
      : ref.status === 'deleted'
        ? t.deleted
        : ref.status === 'noAccess'
          ? t.noAccess
          : ref.status === 'creating'
            ? t.creating
            : t.loading
  const href = `/p/${pageId}`
  return (
    <a
      className={`subpage-card subpage-${ref.status}`}
      data-testid="subpage-card"
      data-status={ref.status}
      href={ok ? href : undefined}
      contentEditable={false}
      draggable={false}
      aria-disabled={!ok}
      onClick={(e) => {
        e.preventDefault()
        if (ok) router.push(href)
      }}
    >
      <span className="subpage-icon" aria-hidden>
        {ref.status === 'ok' ? (ref.icon ?? DEFAULT_ICON) : DEFAULT_ICON}
      </span>
      <span className="subpage-title">{label}</span>
    </a>
  )
}

export const createSubpageBlock = createReactBlockSpec(
  { type: 'subpage', propSchema: { pageId: { default: '' } }, content: 'none' },
  {
    render: ({ block }) => <SubpageCard pageId={block.props.pageId} />,
    // Copy to other apps / HTML export: a plain link, no title (hook-free). Internal copy keeps the block exactly
    // (blocknote/html).
    toExternalHTML: ({ block }) => (
      <a href={`/p/${block.props.pageId}`} data-subpage-id={block.props.pageId}>
        {`/p/${block.props.pageId}`}
      </a>
    ),
  },
)
