'use client'
import { useState } from 'react'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import Check from '@mui/icons-material/Check'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import FormatIndentDecrease from '@mui/icons-material/FormatIndentDecrease'
import FormatIndentIncrease from '@mui/icons-material/FormatIndentIncrease'
import LockOpenOutlined from '@mui/icons-material/LockOpenOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import MoreHoriz from '@mui/icons-material/MoreHoriz'
import { th } from '@/i18n/th'
import type { PageCan } from '@/lib/contracts/pages'
import { usePageActions, type PageRef } from './usePageActions'

export interface PageMenuTarget extends PageRef {
  isCharter: boolean
  /** The page itself is protected (pages.locked) — not an inherited protection. */
  locked: boolean
}

/** Keyboard moves of a tree row (FR-503); only the possible ones are passed. */
export interface PageMenuMoves {
  up?: () => void
  down?: () => void
  indent?: () => void
  outdent?: () => void
}

export interface PageActionsMenuProps {
  page: PageMenuTarget
  can: Pick<PageCan, 'duplicate' | 'delete' | 'protect'>
  /** The page is the one on screen: after a delete go to its parent / the space root. */
  navigateAfterDelete: boolean
  /** Optimistic: called with the new value, and again with the old one when the action fails. */
  onProtectedChange?: (locked: boolean) => void
  /** After the server saved the protection change. */
  onProtectedSaved?: (locked: boolean) => void
  /** Tree rows: ย้ายขึ้น / ย้ายลง / ย้ายเข้าไปใต้หน้าก่อนหน้า / ดึงออก — the keyboard path for drag (FR-503). */
  moves?: PageMenuMoves
  className?: string
  /** Roving focus in the page tree: -1 on rows that are not the tree's tab stop. */
  tabIndex?: number
  /** After the server deleted the page, before its row disappears (the tree moves focus to a neighbour row). */
  onDeleted?: () => void
  /** The page header's "เต็มความกว้าง" switch (FR-1602, M6.1-D15): passed only when the viewer may edit the page. */
  fullWidth?: { checked: boolean; onToggle: () => void }
}

const MOVE_ITEMS = [
  { key: 'up', label: th.pages.tree.moveUp, Icon: ArrowUpward },
  { key: 'down', label: th.pages.tree.moveDown, Icon: ArrowDownward },
  { key: 'indent', label: th.pages.tree.indent, Icon: FormatIndentIncrease },
  { key: 'outdent', label: th.pages.tree.outdent, Icon: FormatIndentDecrease },
] as const

/**
 * "⋯" menu of a page (FR-508, FR-509, FR-510): ทำสำเนา · (tree rows) ย้ายขึ้น/ลง/เข้า/ดึงออก · ล็อก/ปลดล็อกหน้า (managers
 * on wiki pages) · ลบหน้า (never for the charter, M4-D6; undo toast instead of a confirm — P2). Renders nothing when
 * the viewer has no item.
 */
export function PageActionsMenu({
  page,
  can,
  navigateAfterDelete,
  onProtectedChange,
  onProtectedSaved,
  moves,
  className,
  tabIndex,
  onDeleted,
  fullWidth,
}: PageActionsMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const canDelete = can.delete && !page.isCharter
  const anyMove = moves !== undefined && MOVE_ITEMS.some((m) => moves[m.key] !== undefined)
  if (!can.duplicate && !canDelete && !can.protect && !anyMove && !fullWidth) return null
  const title = page.title || th.pages.untitled
  const menuId = `page-menu-${page.id}`

  return (
    <>
      <IconButton
        size="small"
        className={className}
        tabIndex={tabIndex}
        aria-label={th.pages.menu(title)}
        aria-haspopup="menu"
        aria-expanded={anchor ? true : undefined}
        aria-controls={anchor ? menuId : undefined}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <MoreHoriz fontSize="small" />
      </IconButton>
      {anchor ? (
        <PageMenu
          id={menuId}
          anchor={anchor}
          onClose={() => setAnchor(null)}
          page={page}
          can={{ ...can, delete: canDelete }}
          navigateAfterDelete={navigateAfterDelete}
          onProtectedChange={onProtectedChange}
          onProtectedSaved={onProtectedSaved}
          moves={moves}
          onDeleted={onDeleted}
          fullWidth={fullWidth}
        />
      ) : null}
    </>
  )
}

/** Mounted only while open, so a tree of many rows does not hold one set of mutation hooks per row. The actions keep
 *  running after the menu closes (TanStack mutations outlive their observer). */
function PageMenu({
  id,
  anchor,
  onClose: close,
  page,
  can,
  navigateAfterDelete,
  onProtectedChange,
  onProtectedSaved,
  moves,
  onDeleted,
  fullWidth,
}: Omit<PageActionsMenuProps, 'className' | 'tabIndex'> & {
  id: string
  anchor: HTMLElement
  onClose: () => void
}) {
  const actions = usePageActions()
  const canDelete = can.delete
  return (
    <Menu id={id} anchorEl={anchor} open onClose={close}>
      {fullWidth ? (
        // ✓ + aria-checked: the state is never shown by colour alone (§8.9)
        <MenuItem
          role="menuitemcheckbox"
          aria-checked={fullWidth.checked}
          onClick={() => {
            close()
            fullWidth.onToggle()
          }}
        >
          <ListItemIcon>{fullWidth.checked ? <Check fontSize="small" /> : null}</ListItemIcon>
          <ListItemText>{th.layout.fullWidth}</ListItemText>
        </MenuItem>
      ) : null}
      {can.duplicate ? (
        <MenuItem
          onClick={() => {
            close()
            void actions.duplicate(page)
          }}
        >
          <ListItemIcon>
            <ContentCopyOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText>{th.pages.duplicate}</ListItemText>
        </MenuItem>
      ) : null}
      {MOVE_ITEMS.map(({ key, label, Icon }) => {
        const run = moves?.[key]
        if (!run) return null
        return (
          <MenuItem
            key={key}
            onClick={() => {
              close()
              run()
            }}
          >
            <ListItemIcon>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{label}</ListItemText>
          </MenuItem>
        )
      })}
      {can.protect ? (
        <MenuItem
          onClick={() => {
            close()
            void actions.setProtected(page, !page.locked, onProtectedChange, onProtectedSaved)
          }}
        >
          <ListItemIcon>
            {page.locked ? <LockOpenOutlined fontSize="small" /> : <LockOutlined fontSize="small" />}
          </ListItemIcon>
          <ListItemText>{page.locked ? th.pages.unprotect : th.pages.protect}</ListItemText>
        </MenuItem>
      ) : null}
      {canDelete ? (
        <MenuItem
          onClick={() => {
            close()
            void actions.remove(page, { navigate: navigateAfterDelete, onDeleted })
          }}
        >
          <ListItemIcon>
            <DeleteOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText>{th.pages.delete}</ListItemText>
        </MenuItem>
      ) : null}
    </Menu>
  )
}
