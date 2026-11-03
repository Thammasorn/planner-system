'use client'
// src/components/database/menus/ColumnMenu.tsx — the column header menu (FR-1412): name · เปลี่ยนชนิด (TITLE disabled
// with the reason) · type settings (options / number display) · sort ↑/↓ (= the view's only sort) · กรอง (opens the
// filter menu prefilled) · ซ่อนในมุมมองนี้ · insert left / right · duplicate with values · delete (not TITLE).
// A Popover (not a Menu) so typing in the name / option fields never triggers menu typeahead. No confirm dialog:
// destructive items toast "เลิกทำ" from the data layer (FR-1414…1416).
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import FilterListOutlined from '@mui/icons-material/FilterListOutlined'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp'
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined'
import Divider from '@mui/material/Divider'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import MenuList from '@mui/material/MenuList'
import Popover, { type PopoverProps } from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import { type JSX, useState } from 'react'
import { DB_LIMITS } from '@/domain/database'
import { th } from '@/i18n/th'
import type { DbColumnDTO, DbViewDTO } from '@/lib/contracts/databases'
import { findById, previousId } from '@/lib/database/optimistic'
import { TypeIcon, USER_COLUMN_TYPES } from '../cells/typeIcons'
import { useDbApi } from '../data/contract'
import { NumberConfigEditor } from './NumberConfigEditor'
import { OptionsEditor } from './OptionsEditor'
import s from './menus.module.css'

export interface ColumnMenuProps {
  /** An element, or a function MUI calls at every positioning (TableView: the column's live header). */
  anchorEl: PopoverProps['anchorEl'] | null
  columnId: string
  view: DbViewDTO
  onClose: () => void
  /** FR-1411: a just-created column opens with its name field focused and selected. */
  focusName?: boolean
  /** "กรอง" → the toolbar's filter menu with a new filter on this column. */
  onFilter?: (columnId: string) => void
  /** A column inserted left / right (its temp id): the caller opens its menu with the name focused. */
  onInserted?: (columnId: string) => void
}

export function ColumnMenu(p: ColumnMenuProps): JSX.Element | null {
  const api = useDbApi()
  const column = findById(api.db.columns, p.columnId)
  if (!column) return null
  return (
    <Popover
      open={p.anchorEl != null}
      anchorEl={p.anchorEl}
      onClose={p.onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { 'aria-label': th.database.columnMenu.label(column.name), role: 'dialog' } }}
    >
      <ColumnMenuBody {...p} column={column} />
    </Popover>
  )
}

function ColumnMenuBody(p: ColumnMenuProps & { column: DbColumnDTO }): JSX.Element {
  const api = useDbApi()
  const { column, view } = p
  const isTitle = column.type === 'TITLE'
  const [name, setName] = useState(column.name)
  const [typesOpen, setTypesOpen] = useState(false)
  const t = th.database.columnMenu
  const full = api.db.columns.length >= DB_LIMITS.columns

  const commitName = () => {
    const n = name.trim()
    if (n === '' || n === column.name) setName(column.name)
    else api.updateColumn(column.id, { name: n })
  }
  const run = (fn: () => void) => () => {
    commitName()
    p.onClose()
    fn()
  }
  const sortBy = (dir: 'ASC' | 'DESC') =>
    api.updateView(view.id, { config: { ...view.config, sorts: [{ columnId: column.id, dir }] } })
  const hide = () =>
    api.updateView(view.id, {
      config: { ...view.config, hiddenColumnIds: [...(view.config.hiddenColumnIds ?? []), column.id] },
    })
  const insert = (left: boolean) => {
    const after = left ? previousId(api.db.columns, column.id) : column.id
    void api.createColumn('TEXT', { afterColumnId: after }).then((id) => {
      if (id !== '') p.onInserted?.(id)
    })
  }

  return (
    <div className={s.panel} data-testid="db-column-menu">
      <TextField
        size="small"
        label={t.rename}
        value={name}
        autoFocus={p.focusName ?? false}
        onFocus={(e) => {
          if (p.focusName) e.target.select()
        }}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') e.stopPropagation()
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            commitName()
            p.onClose()
          }
        }}
        slotProps={{ htmlInput: { maxLength: DB_LIMITS.name } }}
      />
      <MenuList dense autoFocusItem={!(p.focusName ?? false)}>
        <MenuItem disabled={isTitle} onClick={() => setTypesOpen((x) => !x)} aria-expanded={typesOpen}>
          <ListItemIcon className={s.typeIcon}>
            <TypeIcon type={column.type} />
          </ListItemIcon>
          <ListItemText
            primary={t.changeType}
            secondary={isTitle ? th.database.errors.titleColumn : th.database.types[column.type]}
          />
          {isTitle ? null : typesOpen ? (
            <KeyboardArrowUp fontSize="small" />
          ) : (
            <KeyboardArrowDown fontSize="small" />
          )}
        </MenuItem>
        {typesOpen && !isTitle
          ? USER_COLUMN_TYPES.map((type) => (
              <MenuItem
                key={type}
                selected={type === column.type}
                sx={{ pl: 4 }}
                onClick={run(() => api.changeColumnType(column.id, type))}
              >
                <ListItemIcon className={s.typeIcon}>
                  <TypeIcon type={type} />
                </ListItemIcon>
                <ListItemText>{th.database.types[type]}</ListItemText>
              </MenuItem>
            ))
          : null}
      </MenuList>
      {column.type === 'SELECT' || column.type === 'MULTI_SELECT' ? <OptionsEditor column={column} /> : null}
      {column.type === 'NUMBER' ? (
        <>
          <div className={s.sectionTitle}>{t.config}</div>
          <NumberConfigEditor column={column} />
        </>
      ) : null}
      <Divider />
      <MenuList dense>
        <MenuItem onClick={run(() => sortBy('ASC'))}>
          <ListItemIcon>
            <ArrowUpward fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t.sortAsc}</ListItemText>
        </MenuItem>
        <MenuItem onClick={run(() => sortBy('DESC'))}>
          <ListItemIcon>
            <ArrowDownward fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t.sortDesc}</ListItemText>
        </MenuItem>
        <MenuItem onClick={run(() => p.onFilter?.(column.id))}>
          <ListItemIcon>
            <FilterListOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t.filter}</ListItemText>
        </MenuItem>
        {isTitle ? null : (
          <MenuItem onClick={run(hide)}>
            <ListItemIcon>
              <VisibilityOffOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t.hide}</ListItemText>
          </MenuItem>
        )}
        <Divider />
        <MenuItem disabled={full} onClick={run(() => insert(true))}>
          <ListItemText inset>{t.insertLeft}</ListItemText>
        </MenuItem>
        <MenuItem disabled={full} onClick={run(() => insert(false))}>
          <ListItemText inset>{t.insertRight}</ListItemText>
        </MenuItem>
        {isTitle ? null : (
          <MenuItem disabled={full} onClick={run(() => api.duplicateColumn(column.id))}>
            <ListItemIcon>
              <ContentCopyOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t.duplicate}</ListItemText>
          </MenuItem>
        )}
        {isTitle ? null : (
          <MenuItem onClick={run(() => api.deleteColumn(column.id))}>
            <ListItemIcon>
              <DeleteOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t.delete}</ListItemText>
          </MenuItem>
        )}
      </MenuList>
    </div>
  )
}
