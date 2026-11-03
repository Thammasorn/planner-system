'use client'
// src/components/database/menus/RowMenu.tsx — the row context menu of every database view (FR-1424a, owner request
// 2026-11-03, AFFiNE / Notion-like): right-click a table row, a kanban card or a calendar entry; click the table row's
// ⠿ handle (a click, not a drag); or Shift+F10 / the ContextMenu key on a focused row cell or card (§8.9 keyboard
// parity). Items: เปิด (side panel) · เปิดเป็นหน้า (/r/<id>) · ทำสำเนาแถว (title + cells, right below) · ลบแถว — or
// "ลบ N แถว" when the row is part of a checkbox selection. Delete is immediate (soft delete + the existing
// "ลบ N แถว · เลิกทำ" toast, Cmd+Z) — no dialog. Read-only viewers get เปิด / เปิดเป็นหน้า only. Focus goes back to
// the element the menu was opened from (or to `fallbackFocus` when that element left the page, e.g. a deleted row).
import ContentCopy from '@mui/icons-material/ContentCopy'
import DeleteOutline from '@mui/icons-material/DeleteOutlined'
import NorthEastOutlined from '@mui/icons-material/NorthEastOutlined'
import OpenInFull from '@mui/icons-material/OpenInFull'
import Divider from '@mui/material/Divider'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import {
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useRef,
  useState,
} from 'react'
import Link from '@/components/Link'
import { DB_LIMITS } from '@/domain/database'
import { th } from '@/i18n/th'
import { findById } from '@/lib/database/optimistic'
import { rowPageHref } from '@/lib/database/row-param'
import { useDbApi } from '../data/contract'

interface Target {
  /** The row the menu was opened on. */
  rowId: string
  /** Every row the delete item acts on (the selection when `rowId` is part of it, else just `rowId`). */
  rowIds: string[]
  at: { kind: 'point'; x: number; y: number } | { kind: 'element'; el: HTMLElement }
  /** Where focus returns on close. */
  returnTo: HTMLElement | null
}

export interface RowMenuApi {
  /** Right-click handler for a row / card: opens the app menu instead of the browser's. */
  onContextMenu: (e: ReactMouseEvent<HTMLElement>, rowId: string) => void
  /** Shift+F10 / ContextMenu key handler (returns true when it opened the menu). */
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>, rowId: string) => boolean
  /** Opens the menu under `el` (the row handle's click). */
  openAt: (el: HTMLElement, rowId: string) => void
  /** The menu element — render it once in the view. */
  menu: JSX.Element | null
}

/** Text fields (an open cell editor, the quick-add input) keep the browser's own menu (copy / paste / spelling). */
function inTextField(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    t.closest('input:not([type="checkbox"]), textarea, [contenteditable="true"], [role="textbox"]') !== null
  )
}

/** Shift+F10 or the ContextMenu key. */
export function isMenuKey(e: { key: string; code?: string; shiftKey: boolean }): boolean {
  return (
    e.key === 'ContextMenu' ||
    e.code === 'ContextMenu' ||
    (e.shiftKey && (e.key === 'F10' || e.code === 'F10'))
  )
}

export function useRowMenu(o: {
  openRow: (rowId: string) => void
  /** The table's checkbox selection; kanban / calendar have none. */
  selection?: ReadonlySet<string>
  /** Called after the delete item ran (the table clears its selection). */
  onDeleted?: (rowIds: string[]) => void
  /** Focus target when the opener left the page (the deleted row's cell). */
  fallbackFocus?: () => HTMLElement | null
}): RowMenuApi {
  const api = useDbApi()
  const [target, setTarget] = useState<Target | null>(null)
  // set synchronously: a keyboard-opened menu is followed by the browser's own `contextmenu` event on the same element
  const openRef = useRef(false)
  const { selection } = o

  const open = useCallback(
    (rowId: string, at: Target['at'], returnTo: HTMLElement | null) => {
      openRef.current = true
      const inSelection = selection !== undefined && selection.size > 1 && selection.has(rowId)
      setTarget({ rowId, rowIds: inSelection ? [...selection] : [rowId], at, returnTo })
    },
    [selection],
  )

  const close = (refocus: boolean) => {
    const back = target?.returnTo ?? null
    openRef.current = false
    setTarget(null)
    if (!refocus) return
    // after MUI's own focus restore: the opener when it is still on the page, else the fallback
    window.setTimeout(() => {
      const el = back && back.isConnected ? back : (o.fallbackFocus?.() ?? null)
      el?.focus()
    }, 0)
  }

  const onContextMenu: RowMenuApi['onContextMenu'] = (e, rowId) => {
    if (inTextField(e.target)) return
    e.preventDefault()
    e.stopPropagation()
    if (openRef.current) return // the keyboard handler already opened it
    const keyboard = e.clientX === 0 && e.clientY === 0
    const opener =
      e.target instanceof HTMLElement
        ? (e.target.closest<HTMLElement>('[tabindex], button, a') ?? e.currentTarget)
        : e.currentTarget
    open(
      rowId,
      keyboard ? { kind: 'element', el: opener } : { kind: 'point', x: e.clientX, y: e.clientY },
      opener,
    )
  }
  const onKeyDown: RowMenuApi['onKeyDown'] = (e, rowId) => {
    if (!isMenuKey(e) || inTextField(e.target)) return false
    e.preventDefault()
    e.stopPropagation()
    const el = e.target instanceof HTMLElement ? e.target : e.currentTarget
    open(rowId, { kind: 'element', el }, el)
    return true
  }
  const openAt: RowMenuApi['openAt'] = (el, rowId) => open(rowId, { kind: 'element', el }, el)

  let menu: JSX.Element | null = null
  if (target) {
    const row = findById(api.db.rows, target.rowId)
    const title = row ? row.title || th.database.table.untitledRow : ''
    const t = th.database.rowMenu
    const n = target.rowIds.length
    const full = api.db.rows.length >= DB_LIMITS.rows
    menu = (
      <Menu
        open
        onClose={() => close(true)}
        {...(target.at.kind === 'point'
          ? {
              anchorReference: 'anchorPosition' as const,
              anchorPosition: { top: target.at.y, left: target.at.x },
            }
          : {
              anchorEl: target.at.el,
              anchorOrigin: { vertical: 'bottom' as const, horizontal: 'left' as const },
            })}
        disableRestoreFocus
        slotProps={{ list: { 'aria-label': t.label(title), dense: true } }}
        data-testid="db-row-menu"
      >
        <MenuItem
          onClick={() => {
            close(false)
            o.openRow(target.rowId)
          }}
        >
          <ListItemIcon>
            <OpenInFull fontSize="small" aria-hidden="true" />
          </ListItemIcon>
          <ListItemText>{t.open}</ListItemText>
        </MenuItem>
        <MenuItem component={Link} href={rowPageHref(target.rowId)} onClick={() => close(false)}>
          <ListItemIcon>
            <NorthEastOutlined fontSize="small" aria-hidden="true" />
          </ListItemIcon>
          <ListItemText>{t.openAsPage}</ListItemText>
        </MenuItem>
        {api.canEdit && row
          ? [
              <MenuItem
                key="dup"
                disabled={full}
                onClick={() => {
                  close(true)
                  void api.createRows([{ title: row.title, cells: { ...row.cells }, afterRowId: row.id }])
                }}
              >
                <ListItemIcon>
                  <ContentCopy fontSize="small" aria-hidden="true" />
                </ListItemIcon>
                <ListItemText>{t.duplicate}</ListItemText>
              </MenuItem>,
              <Divider key="div" />,
              <MenuItem
                key="del"
                onClick={() => {
                  const ids = target.rowIds
                  close(true)
                  api.deleteRows(ids)
                  o.onDeleted?.(ids)
                }}
              >
                <ListItemIcon>
                  <DeleteOutline fontSize="small" aria-hidden="true" />
                </ListItemIcon>
                <ListItemText>{n > 1 ? t.deleteMany(n) : t.delete}</ListItemText>
              </MenuItem>,
            ]
          : null}
      </Menu>
    )
  }
  return { onContextMenu, onKeyDown, openAt, menu }
}
