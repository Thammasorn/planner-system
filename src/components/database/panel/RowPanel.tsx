'use client'
// src/components/database/panel/RowPanel.tsx — the row side panel (FR-1450…1452, M11-D26/D39), opened by
// `?db=<databaseId>&row=<rowId>` in the block whose database it is: ˄/˅ follow the open view's filtered + sorted order,
// title (📄 when the row has a body), every live column (RowProperties, hidden ones too), the compact row body (S5's
// RowBody), "เปิดเป็นหน้า" (/r/<id>, Cmd-click = new tab), 🔗 copy the row link, delete (undo toast, closes),
// "สร้างโดย … · แก้ล่าสุดโดย …". A persistent Drawer on the right (--panel-width) from md, a full-screen sheet below;
// Esc closes (not while typing).
import Close from '@mui/icons-material/Close'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp'
import LinkOutlined from '@mui/icons-material/LinkOutlined'
import NorthEastOutlined from '@mui/icons-material/NorthEastOutlined'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import { useTheme } from '@mui/material/styles'
import Tooltip from '@mui/material/Tooltip'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useQuery } from '@tanstack/react-query'
import { type JSX, useRef, useState } from 'react'
import { RowBody } from '@/components/editor/RowBody'
import { copyLink } from '@/components/layout/CopyLinkButton'
import Link from '@/components/Link'
import { DB_LIMITS } from '@/domain/database'
import { useHotkeys } from '@/hooks/useHotkeys'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import type { DbRowDTO } from '@/lib/contracts/databases'
import type { RowBodyView } from '@/lib/contracts/row-pages'
import { displayName } from '@/lib/display-name'
import { findById, sameDbId } from '@/lib/database/optimistic'
import { rowPageHref, rowParamHref } from '@/lib/database/row-param'
import { formatThaiInstantDate } from '@/lib/format'
import { qk } from '@/lib/query-keys'
import { isTempId } from '@/lib/temp-id'
import { BodyMark } from '../cells/CellDisplay'
import { usePersonLookup } from '../cells/people'
import { useDbApi } from '../data/contract'
import { RowProperties } from './RowProperties'
import s from './panel.module.css'

export interface RowPanelProps {
  rowId: string
  /** Row ids of the open view in its order (˄/˅, FR-1451). */
  order: readonly string[]
  viewId?: string
  onNavigate: (rowId: string) => void
  onClose: () => void
}

export function RowPanel(p: RowPanelProps): JSX.Element | null {
  const api = useDbApi()
  const sheet = useMediaQuery(useTheme().breakpoints.down('md'))
  const row = findById(api.db.rows, p.rowId)
  useHotkeys([{ hotkey: { code: 'Escape', key: 'Escape' }, handler: p.onClose }], { enabled: !sheet })
  return (
    <Drawer
      variant={sheet ? 'temporary' : 'persistent'}
      anchor="right"
      open
      onClose={p.onClose}
      sx={
        sheet
          ? { '& .MuiDrawer-paper': { width: '100%', boxSizing: 'border-box' } }
          : {
              '& .MuiDrawer-paper': {
                top: 'var(--header-height)',
                height: 'calc(100% - var(--header-height))',
                width: 'var(--panel-width)',
                maxWidth: '100vw',
                boxSizing: 'border-box',
                borderLeft: '1px solid var(--border-subtle)',
              },
            }
      }
      slotProps={{
        paper: {
          component: 'aside',
          'aria-label': th.database.panel.label,
          'data-testid': 'db-row-panel',
        } as object,
      }}
    >
      {row ? (
        <PanelBody key={row.id} row={row} {...p} />
      ) : (
        <div className={s.panel}>
          <div className={s.bar}>
            <span className={s.barSpacer}>{th.database.rowPage.notFound}</span>
            <IconButton size="small" aria-label={th.database.panel.close} onClick={p.onClose}>
              <Close fontSize="small" />
            </IconButton>
          </div>
        </div>
      )}
    </Drawer>
  )
}

function PanelBody(p: RowPanelProps & { row: DbRowDTO }): JSX.Element {
  const api = useDbApi()
  const people = usePersonLookup()
  const { row } = p
  const i = p.order.findIndex((id) => sameDbId(id, row.id))
  const prev = i > 0 ? p.order[i - 1] : undefined
  const next = i >= 0 && i < p.order.length - 1 ? p.order[i + 1] : undefined
  const t = th.database.panel
  const nameOf = (id: string) => {
    const ref = people(id)
    return ref ? displayName(ref) : th.database.cells.unknownPerson
  }
  const when = (iso: string) => formatThaiInstantDate(new Date(iso), 'medium')

  return (
    <div className={s.panel}>
      <div className={s.bar}>
        <Tooltip title={t.prev}>
          <span>
            <IconButton
              size="small"
              aria-label={t.prev}
              disabled={!prev}
              onClick={() => prev && p.onNavigate(prev)}
            >
              <KeyboardArrowUp fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t.next}>
          <span>
            <IconButton
              size="small"
              aria-label={t.next}
              disabled={!next}
              onClick={() => next && p.onNavigate(next)}
            >
              <KeyboardArrowDown fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <span className={s.barSpacer} />
        <Button
          size="small"
          color="inherit"
          component={Link}
          href={rowPageHref(row.id)}
          startIcon={<NorthEastOutlined />}
          disabled={isTempId(row.id)}
        >
          {t.openAsPage}
        </Button>
        <Tooltip title={t.copyLink}>
          <IconButton
            size="small"
            aria-label={t.copyLink}
            onClick={() => void copyLink(rowParamHref(window.location.pathname, api.db.id, row.id))}
          >
            <LinkOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        {api.canEdit ? (
          <Tooltip title={t.deleteRow}>
            <IconButton
              size="small"
              aria-label={t.deleteRow}
              onClick={() => {
                api.deleteRows([row.id])
                p.onClose()
              }}
            >
              <DeleteOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
        <IconButton size="small" aria-label={t.close} onClick={p.onClose}>
          <Close fontSize="small" />
        </IconButton>
      </div>
      <PanelTitle row={row} />
      <RowProperties row={row} {...(p.viewId ? { viewId: p.viewId } : {})} />
      <section className={s.section} aria-label={t.body}>
        <h3 className={s.sectionTitle}>{t.body}</h3>
        {isTempId(row.id) ? <div className={s.bodySkeleton} /> : <PanelRowBody rowId={row.id} />}
      </section>
      <div className={s.meta}>
        <span>{t.createdBy(nameOf(row.createdBy), when(row.createdAt))}</span>
        <span>{t.updatedBy(nameOf(row.updatedBy), when(row.updatedAt))}</span>
      </div>
    </div>
  )
}

function PanelTitle({ row }: { row: DbRowDTO }): JSX.Element {
  const api = useDbApi()
  const [draft, setDraft] = useState(row.title)
  const [prev, setPrev] = useState(row.title)
  if (prev !== row.title) {
    setPrev(row.title)
    setDraft(row.title)
  }
  const cancelled = useRef(false)
  if (!api.canEdit)
    return (
      <div className={s.titleRow}>
        <h2 className={s.titleText}>{row.title || th.database.table.untitledRow}</h2>
        {row.hasBody ? <BodyMark /> : null}
      </div>
    )
  return (
    <div className={s.titleRow}>
      <input
        className={s.title}
        value={draft}
        maxLength={DB_LIMITS.rowTitle}
        placeholder={th.database.table.untitledRow}
        aria-label={th.database.types.TITLE}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false
            return
          }
          const next = draft.trim()
          if (next !== row.title) api.updateRow(row.id, { title: next })
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.code === 'Enter' || e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          } else if (e.code === 'Escape' || e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            cancelled.current = true
            setDraft(row.title)
            e.currentTarget.blur()
          }
        }}
      />
      {row.hasBody ? <BodyMark /> : null}
    </div>
  )
}

function PanelRowBody({ rowId }: { rowId: string }): JSX.Element {
  const api = useDbApi()
  const q = useQuery({
    queryKey: qk.rowBody(rowId),
    queryFn: ({ signal }) =>
      getJson<RowBodyView>(`/api/database-rows/${encodeURIComponent(rowId)}/body`, { signal }),
  })
  if (!q.data) return <div className={s.bodySkeleton} aria-busy="true" />
  return <RowBody view={q.data} variant="compact" canEdit={api.canEdit} />
}
