'use client'
// src/components/editor/blocks/database/DatabaseBlock.tsx — what a `database` block renders (FR-1401…1408, FR-1464,
// FR-1471, M11-D13/D21): `databaseId === ''` → "กำลังสร้างฐานข้อมูล…" while this tab's slash item creates it (a stale
// empty block from elsewhere → "ไม่พบฐานข้อมูล"); a paste copying it → "กำลังคัดลอกฐานข้อมูล…"; otherwise the island
// with S3's DatabaseBlockView. Placeholders keep the final block's minimum size (screenshot-ready, M11-D2). The title
// of the database (from the shared qk.database cache, never fetched here) is remembered for the clipboard and row
// bodies (M11-D13/D38).
import Skeleton from '@mui/material/Skeleton'
import { skipToken, useQuery } from '@tanstack/react-query'
import { type JSX, useEffect } from 'react'
import { DatabaseBlockView } from '@/components/database/DatabaseBlockView'
import { th } from '@/i18n/th'
import type { DatabaseResponse } from '@/lib/contracts/databases'
import { rememberDatabaseTitle, useDatabaseBlockPhase } from '@/lib/editor/database-block-state'
import { qk } from '@/lib/query-keys'
import { usePageEditor } from '../../PageEditorContext'
import { IslandFrame } from './IslandFrame'

export interface DatabaseBlockProps {
  blockId: string
  databaseId: string
  /** The editor's editable flag (fallback when there is no page context: headless use). */
  editorEditable: boolean
}

export function DatabaseBlock({ blockId, databaseId, editorEditable }: DatabaseBlockProps): JSX.Element {
  const ctx = usePageEditor()
  const phase = useDatabaseBlockPhase(blockId)
  const pageId = ctx?.pageId ?? null
  useRememberTitle(pageId, databaseId)

  if (databaseId === '' || phase === 'copying') {
    const text =
      phase === 'copying' ? th.database.copying : phase === 'creating' ? th.database.creating : th.database.notFound
    return (
      <IslandFrame>
        <div
          className="app-db-placeholder"
          data-testid="db-block"
          data-database-id={databaseId}
          data-state={phase ?? 'missing'}
          role="region"
          aria-label={text}
          aria-busy={phase !== null}
        >
          {phase !== null ? <Skeleton variant="rounded" className="app-db-placeholder__skeleton" /> : null}
          <span role="status">{text}</span>
        </div>
      </IslandFrame>
    )
  }

  return (
    <IslandFrame>
      <DatabaseBlockView
        pageId={pageId}
        databaseId={databaseId}
        blockId={blockId}
        variant={ctx?.variant ?? 'page'}
        // FR-1462: database data follows the page permission, not the lease / editor editable flag
        editable={ctx ? (ctx.canEdit ?? ctx.editable) : editorEditable}
      />
    </IslandFrame>
  )
}

/** Observes (never fetches) the cached database to remember its title for the clipboard / row bodies. */
function useRememberTitle(pageId: string | null, databaseId: string): void {
  const enabled = pageId !== null && databaseId !== ''
  const { data: title } = useQuery({
    queryKey: qk.database(pageId ?? '', databaseId),
    queryFn: skipToken,
    select: (d: DatabaseResponse) => d.title,
    enabled,
  })
  useEffect(() => {
    if (enabled && title !== undefined) rememberDatabaseTitle(databaseId, title)
  }, [enabled, databaseId, title])
}
