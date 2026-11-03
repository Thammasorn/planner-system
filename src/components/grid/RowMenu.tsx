'use client'
// src/components/grid/RowMenu.tsx — the row-header menu of the plan grid (v3.8, FR-6xx grid row menu): right click on
// the frozen task / assignee header, its ⋯ button, or Shift+F10 / ContextMenu on a focused row header. Items come from
// useRowMenu (เปิด · เปิดเป็นหน้า · เพิ่มงานย่อย · ลบงาน / ลบ N งาน · นำ <name> ออกจากงาน). An `href` item is a real
// link (Next Link: modified clicks stay native). The cell menu (CellMenu, M7) stays separate.
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import Box from '@mui/material/Box'
import { useRef, type JSX, type MouseEvent } from 'react'
import Link from '@/components/Link'
import { QuickAdd } from '@/components/tasks/QuickAdd'
import { th } from '@/i18n/th'

export interface RowMenuItem {
  id: string
  label: string
  /** a link item (เปิดเป็นหน้า) */
  href?: string
  onSelect?: (e: MouseEvent<HTMLElement>) => void
}

export type RowMenuAnchor = { el: HTMLElement } | { x: number; y: number }

export interface RowMenuProps {
  anchor: RowMenuAnchor | null
  items: readonly RowMenuItem[]
  onClose: () => void
}

export function RowMenu(p: RowMenuProps): JSX.Element {
  const a = p.anchor
  const placement =
    a && 'x' in a
      ? { anchorReference: 'anchorPosition' as const, anchorPosition: { left: a.x, top: a.y } }
      : { anchorEl: a?.el ?? null }
  return (
    <Menu
      open={a !== null}
      onClose={() => p.onClose()}
      {...placement}
      slotProps={{ list: { 'aria-label': th.tasks.rowMenu.label } }}
      data-testid="row-menu"
    >
      {p.items.map((it) =>
        it.href !== undefined ? (
          <MenuItem
            key={it.id}
            component={Link}
            href={it.href}
            prefetch={false}
            onClick={(e: MouseEvent<HTMLElement>) => {
              it.onSelect?.(e)
              p.onClose()
            }}
            data-testid={`row-menu-${it.id}`}
          >
            {it.label}
          </MenuItem>
        ) : (
          <MenuItem
            key={it.id}
            onClick={(e) => {
              p.onClose()
              it.onSelect?.(e)
            }}
            data-testid={`row-menu-${it.id}`}
          >
            {it.label}
          </MenuItem>
        ),
      )}
    </Menu>
  )
}

export interface SubtaskPopoverProps {
  /** the parent task (null = closed) */
  task: { id: string; name: string } | null
  anchor: () => Element | null
  onCreate: (parentId: string, name: string) => void
  onClose: () => void
}

/** "เพิ่มงานย่อย": the M3 quick-add (name only, Enter creates and keeps the cursor, Esc closes) under the row. */
export function SubtaskPopover(p: SubtaskPopoverProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const t = p.task
  return (
    <Popover
      open={t !== null}
      anchorEl={t ? p.anchor : null}
      onClose={p.onClose}
      disableRestoreFocus
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { 'aria-label': t ? th.grid.row.addSubtaskLabel(t.name) : undefined, role: 'dialog' } }}
    >
      <Box sx={{ px: 1.5, py: 0.5, width: 320 }}>
        {t ? (
          <QuickAdd
            depth={0}
            inset={0}
            disabled={false}
            autoFocus
            inputRef={inputRef}
            label={th.grid.row.addSubtaskLabel(t.name)}
            onCreate={(name) => p.onCreate(t.id, name)}
            onEscape={p.onClose}
          />
        ) : null}
      </Box>
    </Popover>
  )
}
