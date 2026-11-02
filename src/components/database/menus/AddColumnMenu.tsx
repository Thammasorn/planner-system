'use client'
// src/components/database/menus/AddColumnMenu.tsx — "+" column → pick a type (FR-1411): the column is created at once
// with a default name ("ข้อความ", "ตัวเลข 2"; domain defaultColumnName) and `onCreated` gets its (temp) id so the
// caller can open its menu with the name field focused.
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import type { JSX } from 'react'
import { DB_LIMITS } from '@/domain/database'
import { th } from '@/i18n/th'
import type { DbColumnType } from '@/lib/contracts/databases'
import { TypeIcon, USER_COLUMN_TYPES } from '../cells/typeIcons'
import { useDbApi } from '../data/contract'

export interface AddColumnMenuProps {
  anchorEl: HTMLElement | null
  onClose: () => void
  /** Called with the new column's id (a temp id until the server answers). */
  onCreated?: (columnId: string) => void
  /** `null` = first; omitted = last. */
  afterColumnId?: string | null
}

export function AddColumnMenu(p: AddColumnMenuProps): JSX.Element {
  const api = useDbApi()
  const full = api.db.columns.length >= DB_LIMITS.columns
  const pick = (type: Exclude<DbColumnType, 'TITLE'>) => {
    p.onClose()
    void api
      .createColumn(type, p.afterColumnId !== undefined ? { afterColumnId: p.afterColumnId } : undefined)
      .then((id) => {
        if (id !== '') p.onCreated?.(id)
      })
  }
  return (
    <Menu
      anchorEl={p.anchorEl}
      open={p.anchorEl !== null}
      onClose={p.onClose}
      slotProps={{ list: { 'aria-label': th.database.table.addColumn, dense: true } }}
    >
      {full ? (
        <MenuItem disabled>{th.database.errors.limit.columns(DB_LIMITS.columns)}</MenuItem>
      ) : (
        USER_COLUMN_TYPES.map((type) => (
          <MenuItem key={type} onClick={() => pick(type)}>
            <ListItemIcon>
              <TypeIcon type={type} />
            </ListItemIcon>
            <ListItemText>{th.database.types[type]}</ListItemText>
          </MenuItem>
        ))
      )}
    </Menu>
  )
}
