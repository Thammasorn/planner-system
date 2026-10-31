'use client'
// src/components/editor/inline/mention.tsx — mention chip (FR-529, SPEC §7.7, M4-D20/D32). props: { kind, id }.
// From plan/research/snippets/r3/harness/src/inline/mention.tsx with TanStack Query hooks. The document stores ids
// only; names resolve live (renames propagate; titles of pages the viewer cannot see are never shown).
import { createReactInlineContentSpec } from '@blocknote/react'
import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { th } from '@/i18n/th'
import { usePageRef } from '../hooks/usePageRef'
import { usePersonName } from '../hooks/usePersonName'

export function UserChip({ id }: { id: string }): JSX.Element {
  const p = usePersonName(id)
  const t = th.editor.mention
  const label =
    p.status === 'ok'
      ? `@${p.name}${p.active ? '' : ` ${t.deactivated}`}`
      : p.status === 'unknown'
        ? `@${t.unknownUser}`
        : '@…'
  return (
    <span
      className={`mention mention-user${p.status === 'ok' && !p.active ? ' mention-inactive' : ''}`}
      data-testid="mention-user"
      data-id={id}
    >
      {label}
    </span>
  )
}

export function PageChip({ id }: { id: string }): JSX.Element {
  const ref = usePageRef(id)
  const router = useRouter()
  const t = th.editor.mention
  const href = `/p/${id}`
  const label =
    ref.status === 'ok'
      ? ref.title || th.editor.subpage.untitled
      : ref.status === 'noAccess'
        ? t.noAccess
        : ref.status === 'deleted'
          ? t.deletedPage
          : ref.status === 'creating'
            ? t.unknownPage
            : th.editor.subpage.loading
  const ok = ref.status === 'ok'
  return (
    <a
      className={`mention mention-page mention-page-${ref.status}`}
      data-testid="mention-page"
      data-id={id}
      href={ok ? href : undefined}
      aria-disabled={!ok}
      onClick={(e) => {
        e.preventDefault()
        if (ok) router.push(href)
      }}
    >
      <span aria-hidden>{ref.status === 'ok' ? (ref.icon ?? '📄') : '📄'}</span> {label}
    </a>
  )
}

export const Mention = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      kind: { default: 'user', values: ['user', 'page'] as const },
      id: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) =>
      inlineContent.props.kind === 'user' ? (
        <UserChip id={inlineContent.props.id} />
      ) : (
        <PageChip id={inlineContent.props.id} />
      ),
    // Static HTML for copy to other apps / export (no hooks, no names).
    toExternalHTML: ({ inlineContent }) => (
      <span data-mention-kind={inlineContent.props.kind} data-mention-id={inlineContent.props.id}>
        {`@${inlineContent.props.id}`}
      </span>
    ),
  },
)
