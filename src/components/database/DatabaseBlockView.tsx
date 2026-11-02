'use client'
// src/components/database/DatabaseBlockView.tsx — the database island rendered by the editor's `database` block
// (SPEC §4.14, §8.11; FR-1401…1408, FR-1450…1452, FR-1461, FR-1464; M11-D20/D21/D26). Loads the database through the
// shared query (DbApiProvider): a skeleton of the final size while loading, the grey "ไม่พบฐานข้อมูล" box for any
// failure (same for every reason), otherwise header (title + toolbar), view tabs and the selected view (TABLE here;
// KANBAN / CALENDAR from the view registry that S4 fills, "—" until then). The selected tab is viewer state only.
// Rows open in the side panel (`?db=&row=`), or as /r/<id> in a compact editor (no panel on a panel). `?db=<id>`
// alone scrolls the block into view and focuses its title.
import SearchOff from '@mui/icons-material/SearchOff'
import Skeleton from '@mui/material/Skeleton'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useRouter } from 'next/navigation'
import { type JSX, useEffect, useId, useMemo, useRef, useState } from 'react'
import { applyView, makeCollator } from '@/domain/database'
import type { DbCtx } from '@/domain/types'
import { th } from '@/i18n/th'
import { findById } from '@/lib/database/optimistic'
import { consumeDatabaseJustCreated } from '@/lib/editor/database-block-state'
import { closeRowPanel, openRowPanel, rowPageHref, useRowParam } from '@/lib/database/row-param'
import { useDbApi } from './data/contract'
import { DbApiProvider } from './data/DbApiProvider'
import { DatabaseHeader } from './DatabaseHeader'
import s from './DatabaseBlock.module.css'
import { RowPanel } from './panel/RowPanel'
import { TableView } from './table/TableView'
import { DatabaseToolbar } from './toolbar/DatabaseToolbar'
import { newFilter } from './toolbar/FilterMenu'
import { databaseView } from './view-registry'
import { ViewTabs, viewTabId } from './ViewTabs'
import './view-modules'

export interface DatabaseBlockViewProps {
  /** The page whose content holds the block (null while a task body has no row yet). */
  pageId: string | null
  /** '' = a block inserted but not created yet. */
  databaseId: string
  /** The BlockNote block id (deep links `?db=`, copy/paste). */
  blockId: string
  /** 'page' = documents and /r; 'compact' = the task panel body (row click → /r, no panel on a panel). */
  variant: 'page' | 'compact'
  editable: boolean
}

export function DatabaseSkeleton(): JSX.Element {
  return (
    <div
      className={s.skeleton}
      data-testid="db-block"
      role="region"
      aria-label={th.database.loading}
      aria-busy="true"
    >
      <Skeleton variant="text" width="40%" height={36} />
      <Skeleton variant="text" width="30%" />
      <Skeleton variant="rounded" height={136} />
    </div>
  )
}

/** FR-1464: one grey box, an icon and one sentence — never a title or any detail of the database. */
export function DatabaseNotFound({ databaseId }: { databaseId: string }): JSX.Element {
  return (
    <div
      className={s.placeholder}
      data-testid="db-block"
      data-database-id={databaseId}
      data-state="not-found"
      role="note"
    >
      <span className={s.placeholderIcon}>
        <SearchOff fontSize="inherit" aria-hidden="true" />
      </span>
      <span>{th.database.notFound}</span>
    </div>
  )
}

export function DatabaseBlockView(p: DatabaseBlockViewProps): JSX.Element {
  if (p.pageId === null || p.databaseId === '') return <DatabaseSkeleton />
  return (
    <DbApiProvider
      pageId={p.pageId}
      databaseId={p.databaseId}
      editable={p.editable}
      loading={<DatabaseSkeleton />}
      notFound={<DatabaseNotFound databaseId={p.databaseId} />}
    >
      <DatabaseBlockContent blockId={p.blockId} variant={p.variant} />
    </DbApiProvider>
  )
}

/** The loaded block inside a DbApi provider (exported for ui tests with the fake DbApi). */
export function DatabaseBlockContent({
  blockId,
  variant,
}: {
  blockId: string
  variant: 'page' | 'compact'
}): JSX.Element {
  const api = useDbApi()
  const db = api.db
  const router = useRouter()
  const narrow = useMediaQuery('(max-width:599.95px)')
  const uid = useId()
  const titleId = `${uid}-title`
  const panelId = `${uid}-view`
  const [selected, setSelected] = useState<string>(db.views[0]?.id ?? '')
  const view = findById(db.views, selected) ?? db.views[0]
  const [filterRequest, setFilterRequest] = useState(0)

  const ctx = useMemo<DbCtx>(
    () => ({
      people: new Map(Object.entries(db.people)),
      viewerId: api.viewerId,
      today: api.today,
      collator: makeCollator(),
    }),
    [db.people, api.viewerId, api.today],
  )
  const rows = useMemo(
    () => (view ? applyView(db.rows, view, db.columns, ctx) : db.rows),
    [db.rows, db.columns, view, ctx],
  )

  const openRow = (rowId: string) => {
    if (variant === 'compact') router.push(rowPageHref(rowId))
    else openRowPanel(db.id, rowId)
  }
  const filterColumn = (columnId: string) => {
    const col = db.columns.find((c) => c.id === columnId)
    if (!view || !col) return
    api.updateView(view.id, {
      config: { ...view.config, filters: [...(view.config.filters ?? []), newFilter(col)] },
    })
    setFilterRequest((n) => n + 1)
  }

  // ── deep link: ?db=<id> scrolls here + focuses the title; ?db=&row= opens the panel (FR-1452) ──
  const param = useRowParam()
  const mine = param.db === db.id
  const rootRef = useRef<HTMLDivElement>(null)
  // FR-1404: a block this tab's slash menu just created focuses its title once (S5's just-created store)
  useEffect(() => {
    if (!consumeDatabaseJustCreated(blockId)) return
    rootRef.current?.querySelector<HTMLElement>('[data-testid="db-title"]')?.focus()
  }, [blockId])
  useEffect(() => {
    if (!mine) return
    const el = rootRef.current
    if (!el) return
    el.scrollIntoView({ block: 'start' })
    if (param.row !== null) return
    el.querySelector<HTMLElement>('[data-testid="db-title"]')?.focus()
    // a short frame around the linked block (DOM only — nothing to re-render)
    el.dataset.highlight = 'true'
    const t = window.setTimeout(() => delete el.dataset.highlight, 1500)
    return () => {
      window.clearTimeout(t)
      delete el.dataset.highlight
    }
  }, [mine, param.row])

  const reg = view && view.type !== 'TABLE' ? databaseView(view.type) : undefined
  return (
    <div
      ref={rootRef}
      className={s.block}
      data-testid="db-block"
      data-database-id={db.id}
      data-variant={variant}
      data-readonly={!api.canEdit || undefined}
      role="region"
      aria-label={th.database.regionLabel(db.title)}
    >
      <DatabaseHeader blockId={blockId} titleId={titleId}>
        {view ? <DatabaseToolbar view={view} narrow={narrow} filterRequest={filterRequest} /> : null}
      </DatabaseHeader>
      {view ? <ViewTabs selectedId={view.id} onSelect={setSelected} panelId={panelId} /> : null}
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={view ? viewTabId(panelId, view.id) : titleId}
        className={s.viewSlot}
      >
        {!view ? null : view.type === 'TABLE' ? (
          <TableView
            view={view}
            rows={rows}
            openRow={openRow}
            variant={variant}
            narrow={narrow}
            onFilterColumn={filterColumn}
          />
        ) : reg ? (
          <reg.View view={view} rows={rows} openRow={openRow} variant={variant} narrow={narrow} />
        ) : (
          <div className={s.emptySlot}>—</div>
        )}
      </div>
      {mine && param.row !== null && variant === 'page' ? (
        <RowPanel
          rowId={param.row}
          order={rows.map((r) => r.id)}
          {...(view ? { viewId: view.id } : {})}
          onNavigate={(id) => openRowPanel(db.id, id)}
          onClose={closeRowPanel}
        />
      ) : null}
    </div>
  )
}
