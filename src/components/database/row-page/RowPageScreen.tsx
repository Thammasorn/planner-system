'use client'
// src/components/database/row-page/RowPageScreen.tsx — a database row as a page `/r/[rowId]` (SPEC §4.14 FR-1453,
// §8.12; M11-D27, the M6.1 task page pattern). Header bar: ← กลับ (owner page), `หน้าเจ้าของ › ฐานข้อมูล › แถว`, save status
// + lease (portalled by the body), 🔗, ⋯ (คัดลอกลิงก์ · เปิดในแผง · เต็มความกว้าง · ลบแถว). Reading column: the big title
// (Enter → body), every live column as a light property list (RowProperties, shared with the side panel), then the
// row body (RowBody variant "page"). Live data come from qk.database(ownerPageId, databaseId) — the same cache as the
// block and its panel (FR-1401); the first paint of the header comes from the RSC view.
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import LinkOutlined from '@mui/icons-material/LinkOutlined'
import MoreHoriz from '@mui/icons-material/MoreHoriz'
import ViewSidebarOutlined from '@mui/icons-material/ViewSidebarOutlined'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import { useRouter } from 'next/navigation'
import { type JSX, type ReactNode, useRef, useState } from 'react'
import { RowBody } from '@/components/editor/RowBody'
import { copyLink } from '@/components/layout/CopyLinkButton'
import { DocColumn, DocInset } from '@/components/layout/DocColumn'
import { useInAppBack } from '@/components/layout/InAppHistory'
import { PageHeaderBar, type Crumb } from '@/components/layout/PageHeaderBar'
import { useFullWidth } from '@/components/layout/useFullWidth'
import Link from '@/components/Link'
import { DB_LIMITS } from '@/domain/database'
import { useHotkeys } from '@/hooks/useHotkeys'
import { th } from '@/i18n/th'
import type { RowPageView } from '@/lib/contracts/row-pages'
import { findById } from '@/lib/database/optimistic'
import { rowPageHref, rowParamHref } from '@/lib/database/row-param'
import { BodyMark } from '../cells/CellDisplay'
import { useDbApi } from '../data/contract'
import { DbApiProvider } from '../data/DbApiProvider'
import { RowProperties } from '../panel/RowProperties'
import s from './row-page.module.css'

/** An open menu, listbox, dialog or popover owns Esc (R12: it may still be closing when the key reaches window). */
const OVERLAY =
  '[role="menu"],[role="listbox"],[role="dialog"],[role="alertdialog"],.MuiPopover-root,.MuiModal-root'

/** FR-686 pattern: Esc on the row page goes back only when nothing else wants the key. */
function escapeGoesBack(e: { defaultPrevented: boolean }): boolean {
  if (e.defaultPrevented) return false
  return document.querySelector(OVERLAY) === null
}

export function RowPageScreen({ view }: { view: RowPageView }): JSX.Element {
  return (
    <DbApiProvider
      pageId={view.database.ownerPageId}
      databaseId={view.database.id}
      loading={<RowPageFrame view={view} body={<PropertiesSkeleton />} />}
      notFound={<RowPageFrame view={view} body={<Gone />} />}
    >
      <RowPageContent view={view} />
    </DbApiProvider>
  )
}

/** Header crumbs: owner page › database › row (M11-D27). */
function crumbsOf(view: RowPageView, dbTitle: string, rowTitle: string): Crumb[] {
  return [
    {
      // a nested database's owner is an outer row (FR-1453 rev. 2026-11-03), whose title may be empty
      label: view.owner.title || (view.owner.kind === 'DB_ROW' ? th.database.table.untitledRow : ''),
      href: view.owner.href,
    },
    {
      label: dbTitle || th.database.untitled,
      href: rowParamHref(view.owner.href, view.database.id, null),
    },
    { label: rowTitle || th.database.table.untitledRow },
  ]
}

/** Header + column without the live database (loading / not found): titles from the RSC view, no actions. */
function RowPageFrame({ view, body }: { view: RowPageView; body: ReactNode }): JSX.Element {
  const back = useInAppBack(view.owner.href)
  return (
    <>
      <PageHeaderBar crumbs={crumbsOf(view, view.database.title, view.row.title)} back={{ onClick: back }} />
      <DocColumn fullWidth={view.body.page?.fullWidth ?? false}>
        <DocInset>
          <div className={s.titleRow}>
            <h1 className={s.heading} data-empty={view.row.title === '' || undefined}>
              {view.row.title || th.database.table.untitledRow}
            </h1>
          </div>
          {body}
        </DocInset>
      </DocColumn>
    </>
  )
}

function PropertiesSkeleton(): JSX.Element {
  return (
    <Box data-testid="row-properties-loading" aria-label={th.common.loading} sx={{ display: 'grid', gap: 1 }}>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={32} />
      ))}
    </Box>
  )
}

function Gone(): JSX.Element {
  return (
    <p className={s.gone} data-testid="row-gone">
      {th.database.rowPage.gone}
    </p>
  )
}

/**
 * The big row title (M11-D27): an in-place input (empty allowed — BR-90 row titles may be blank, shown as the
 * "ไม่มีชื่อ" placeholder). Enter saves and moves the caret into the body; Esc restores the saved title; blur saves.
 */
function RowTitle(p: {
  title: string
  canEdit: boolean
  onCommit: (title: string) => void
  onEnter: () => void
}): JSX.Element {
  const [draft, setDraft] = useState(p.title)
  const [prev, setPrev] = useState(p.title)
  if (prev !== p.title) {
    setPrev(p.title)
    setDraft(p.title)
  }
  const cancelled = useRef(false)
  if (!p.canEdit)
    return (
      <h1 className={s.heading} data-empty={p.title === '' || undefined}>
        {p.title || th.database.table.untitledRow}
      </h1>
    )
  return (
    <h1 className={s.heading}>
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
          if (next !== p.title) p.onCommit(next)
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.code === 'Enter' || e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
            p.onEnter()
          } else if (e.code === 'Escape' || e.key === 'Escape') {
            // handled here: the page's Esc (= back) must not fire while editing the title
            e.preventDefault()
            e.stopPropagation()
            cancelled.current = true
            setDraft(p.title)
            e.currentTarget.blur()
          }
        }}
      />
    </h1>
  )
}

/** The loaded row page inside a DbApi provider (exported for ui tests with the fake DbApi). */
export function RowPageContent({ view }: { view: RowPageView }): JSX.Element {
  const api = useDbApi()
  const router = useRouter()
  const rowId = view.row.id
  const row = findById(api.db.rows, rowId)
  const title = row?.title ?? view.row.title
  const ownerHref = view.owner.href
  const back = useInAppBack(ownerHref)
  const canEdit = api.canEdit && view.body.can.edit
  const fw = useFullWidth({
    target: { rowId },
    initial: view.body.page?.fullWidth ?? false,
    canEdit: view.body.can.edit,
    label: title || th.database.table.untitledRow,
  })
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const bodyRef = useRef<{ focus(): void }>(null)

  // FR-686 pattern / SPEC §8.6: Esc = back (useHotkeys already skips inputs, the editor and handled events)
  useHotkeys([{ hotkey: { code: 'Escape', key: 'Escape' }, handler: back, skip: (e) => !escapeGoesBack(e) }])

  const copyRowLink = () => copyLink(rowPageHref(rowId))
  const closeMenu = () => setMenu(null)
  const panelHref = rowParamHref(ownerHref, api.db.id, rowId)

  return (
    <>
      <PageHeaderBar
        crumbs={crumbsOf(view, api.db.title, title)}
        back={{ onClick: back }}
        actions={
          <>
            <IconButton
              aria-label={th.layout.copyLink}
              title={th.layout.copyLink}
              onClick={() => void copyRowLink()}
            >
              <LinkOutlined fontSize="small" />
            </IconButton>
            <IconButton
              aria-label={th.layout.more}
              title={th.layout.more}
              aria-haspopup="menu"
              aria-expanded={menu !== null}
              onClick={(e) => setMenu(e.currentTarget)}
            >
              <MoreHoriz fontSize="small" />
            </IconButton>
            <Menu anchorEl={menu} open={menu !== null} onClose={closeMenu}>
              <MenuItem
                onClick={() => {
                  closeMenu()
                  void copyRowLink()
                }}
              >
                <ListItemIcon>
                  <LinkOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText>{th.layout.copyLink}</ListItemText>
              </MenuItem>
              <MenuItem component={Link} href={panelHref} onClick={closeMenu}>
                <ListItemIcon>
                  <ViewSidebarOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText>{th.database.rowPage.openInPanel}</ListItemText>
              </MenuItem>
              {fw.canToggle ? (
                <MenuItem
                  role="menuitemcheckbox"
                  aria-checked={fw.fullWidth}
                  onClick={() => {
                    closeMenu()
                    fw.toggle()
                  }}
                >
                  <ListItemIcon>
                    {fw.fullWidth ? <CheckOutlined fontSize="small" aria-hidden="true" /> : null}
                  </ListItemIcon>
                  <ListItemText>{th.layout.fullWidth}</ListItemText>
                </MenuItem>
              ) : null}
              {canEdit && row ? (
                <MenuItem
                  onClick={() => {
                    closeMenu()
                    api.deleteRows([rowId]) // undo toast "เลิกทำ" (8 s) + Cmd+Z — no confirm (recoverable)
                    // Not back(): the entry behind /r is often the owner page with `?row=<this id>`, whose panel would
                    // then say "ไม่พบแถว". Replace /r with the owner page scrolled to the database instead.
                    router.replace(rowParamHref(ownerHref, api.db.id, null))
                  }}
                  sx={{ color: 'error.main' }}
                >
                  <ListItemIcon sx={{ color: 'inherit' }}>
                    <DeleteOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{th.database.rowPage.deleteRow}</ListItemText>
                </MenuItem>
              ) : null}
            </Menu>
          </>
        }
      />
      <DocColumn fullWidth={fw.fullWidth}>
        <DocInset>
          <div className={s.titleRow} data-testid="row-title">
            <RowTitle
              title={title}
              canEdit={canEdit && row !== undefined}
              onCommit={(next) => api.updateRow(rowId, { title: next })}
              onEnter={() => bodyRef.current?.focus()}
            />
            {row?.hasBody ? <BodyMark /> : null}
          </div>
          {row ? <RowProperties row={row} /> : <Gone />}
          <hr className={s.divider} />
        </DocInset>
        {row ? <RowBody view={view.body} variant="page" canEdit={canEdit} focusRef={bodyRef} /> : null}
      </DocColumn>
    </>
  )
}
