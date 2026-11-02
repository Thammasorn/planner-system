'use client'
// src/components/database/panel/RowProperties.tsx — every live column of a row as a light property list (FR-1450,
// FR-1453, FR-1604): hidden columns included, the value is the CellDisplay and opens the CellEditor in place (click /
// Enter), checkboxes toggle, "+ เพิ่มคอลัมน์" (FR-1411) then the new column's menu with its name focused. Shared by
// the row side panel and S4's row page /r. Read-only viewers see values only (FR-1461).
import Button from '@mui/material/Button'
import { type JSX, useState } from 'react'
import { PropertyList, PropertyRow } from '@/components/layout/PropertyList'
import { rowValue } from '@/domain/database'
import { th } from '@/i18n/th'
import type { CellValue, DbColumnDTO, DbRowDTO } from '@/lib/contracts/databases'
import { CellDisplay, CheckMark } from '../cells/CellDisplay'
import { CellEditor } from '../cells/CellEditor'
import { usePersonLookup } from '../cells/people'
import { useDbApi } from '../data/contract'
import { AddColumnMenu } from '../menus/AddColumnMenu'
import { ColumnMenu } from '../menus/ColumnMenu'
import s from './panel.module.css'

export interface RowPropertiesProps {
  row: DbRowDTO
  /** The view whose settings the column menu edits (sort / hide …); the first view when absent. */
  viewId?: string
  'aria-label'?: string
}

export function RowProperties(p: RowPropertiesProps): JSX.Element {
  const api = useDbApi()
  const cols = api.db.columns.filter((c) => c.type !== 'TITLE')
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const view = api.db.views.find((v) => v.id === p.viewId) ?? api.db.views[0]
  return (
    <>
      <PropertyList aria-label={p['aria-label'] ?? th.database.rowPage.propertiesLabel}>
        {cols.map((col) => (
          <PropertyRow key={col.id} label={col.name} id={`prop-${col.id}`}>
            <PropertyValue column={col} row={p.row} />
          </PropertyRow>
        ))}
      </PropertyList>
      {api.canEdit ? (
        <Button
          size="small"
          color="inherit"
          className={s.addColumn}
          onClick={(e) => {
            setAddAnchor(e.currentTarget)
            setMenuAnchor(e.currentTarget)
          }}
        >
          {th.database.panel.addColumn}
        </Button>
      ) : null}
      <AddColumnMenu
        anchorEl={addAnchor}
        onClose={() => setAddAnchor(null)}
        onCreated={(id) => setMenu(id)}
      />
      {menu && view ? (
        <ColumnMenu
          anchorEl={menuAnchor}
          columnId={menu}
          view={view}
          focusName
          onClose={() => setMenu(null)}
          onInserted={(id) => setMenu(id)}
        />
      ) : null}
    </>
  )
}

function PropertyValue({ column, row }: { column: DbColumnDTO; row: DbRowDTO }): JSX.Element {
  const api = useDbApi()
  const people = usePersonLookup()
  const [editing, setEditing] = useState(false)
  const write = (v: CellValue | null) => api.updateRow(row.id, { cells: { [column.id]: v } })
  if (column.type === 'CHECKBOX') {
    const checked = rowValue(row, column) === true
    return api.canEdit ? (
      <button
        type="button"
        className={s.valueButton}
        data-lead=""
        role="checkbox"
        aria-checked={checked}
        aria-label={column.name}
        onClick={() => write(checked ? null : true)}
      >
        <CheckMark checked={checked} />
      </button>
    ) : (
      <CheckMark checked={checked} />
    )
  }
  if (editing)
    return (
      <CellEditor
        column={column}
        row={row}
        label={column.name}
        people={people}
        today={api.today}
        onCommit={write}
        onDone={() => setEditing(false)}
        {...(column.type === 'SELECT' || column.type === 'MULTI_SELECT'
          ? { createOption: (name: string) => api.addOption(column.id, name) }
          : {})}
      />
    )
  const empty = rowValue(row, column) === null
  const display = <CellDisplay column={column} row={row} people={people} layout="block" />
  if (!api.canEdit) return empty ? <span className={s.empty}>—</span> : display
  return (
    <div
      role="button"
      tabIndex={0}
      className={s.valueButton}
      data-lead=""
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a')) setEditing(true)
      }}
      onKeyDown={(e) => {
        if (e.code === 'Enter' || e.key === 'Enter' || e.code === 'Space' || e.key === ' ') {
          e.preventDefault()
          setEditing(true)
        }
      }}
    >
      {empty ? <span className={s.empty}>{th.database.panel.emptyValue}</span> : display}
    </div>
  )
}
