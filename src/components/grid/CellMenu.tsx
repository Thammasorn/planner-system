'use client'
// src/components/grid/CellMenu.tsx — the grid's cell menu (right click, ContextMenu key, Shift+F10; M7-D23, C28). Default
// item: "↕ รวมเป็นรายสัปดาห์" (BR-23) over every DAY (row, week) of the selection, disabled when there is none.
// Extension point (M8, reviewed): the optional `items` prop replaces the default item (M8's ◆ menu); keep the
// `grid.cellMenu` shortcut and th.grid.day.cellMenu stable. Focus returns to the cell on close (MUI restores it).
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import type { JSX } from 'react'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { PeriodKey } from '@/lib/contracts/grid'
import type { RowKey } from '@/lib/grid/rows'

export interface CellMenuItem {
  id: string
  label: string
  disabled?: boolean
  onSelect(): void
}

export interface CellMenuProps {
  /** focused cell (Shift+F10 / ContextMenu key) or pointer position */
  anchor: { rowKey: RowKey; periodKey: PeriodKey } | { x: number; y: number } | null
  /** DAY (row, week) pairs of the selection */
  targets: readonly { taskAssignmentId: string; week: ISODate }[]
  onCollapse(): void
  onClose(): void
  /** M8: when given, replaces the default collapse item */
  items?: readonly CellMenuItem[]
}

function cellElement(a: { rowKey: RowKey; periodKey: PeriodKey }): Element | null {
  if (typeof document === 'undefined') return null
  return document.querySelector(`[data-testid="cell-${CSS.escape(a.rowKey)}-${CSS.escape(a.periodKey)}"]`)
}

export function CellMenu(p: CellMenuProps): JSX.Element {
  const a = p.anchor
  const items: readonly CellMenuItem[] = p.items ?? [
    {
      id: 'collapseToWeek',
      label: p.targets.length > 0 ? th.grid.day.collapseToWeek : th.grid.day.collapseToWeekDisabled,
      disabled: p.targets.length === 0,
      onSelect: () => p.onCollapse(),
    },
  ]
  const position = a && 'x' in a ? { left: a.x, top: a.y } : undefined
  const el = a && 'rowKey' in a ? cellElement(a) : null
  return (
    <Menu
      open={a !== null}
      onClose={() => p.onClose()}
      {...(position ? { anchorReference: 'anchorPosition' as const, anchorPosition: position } : { anchorEl: el })}
      slotProps={{ list: { 'aria-label': th.grid.day.cellMenu } }}
      data-testid="cell-menu"
    >
      {items.map((it) => (
        <MenuItem
          key={it.id}
          disabled={it.disabled === true}
          onClick={() => {
            p.onClose()
            it.onSelect()
          }}
          data-testid={`cell-menu-${it.id}`}
        >
          {it.label}
        </MenuItem>
      ))}
    </Menu>
  )
}
