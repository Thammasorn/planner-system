'use client'
// src/components/database/menus/OptionsEditor.tsx — SELECT / MULTI_SELECT options in the column menu (FR-1410,
// FR-1416, M11-D17/D35): rename, colour (10 named token colours, the name is always shown), reorder (dnd-kit, keyboard
// sensor too), delete (cells untouched; the data layer toasts "เลิกทำ" that brings the option and the values back),
// and add. Every change is one updateDatabaseColumn with the whole list (ids kept).
import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import DragIndicator from '@mui/icons-material/DragIndicator'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { type JSX, useState } from 'react'
import { DB_LIMITS, OPTION_COLORS, optionsOf } from '@/domain/database'
import type { OptionColor, SelectOption } from '@/domain/types'
import { th } from '@/i18n/th'
import type { DbColumnDTO } from '@/lib/contracts/databases'
import { useDbApi } from '../data/contract'
import { dndAccessibility, useDbSensors } from '../dnd'
import s from './menus.module.css'

/** Keys typed in a field inside a menu must not reach the menu (typeahead / Esc stays for the menu). */
const keepKeys = (e: { key: string; stopPropagation: () => void }) => {
  if (e.key !== 'Escape') e.stopPropagation()
}

export function OptionsEditor({ column }: { column: DbColumnDTO }): JSX.Element {
  const api = useDbApi()
  const options = optionsOf(column)
  const sensors = useDbSensors()
  const [draft, setDraft] = useState('')
  const save = (next: readonly SelectOption[]) =>
    api.updateColumn(column.id, { config: { options: [...next] } })
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = options.findIndex((o) => o.id === active.id)
    const to = options.findIndex((o) => o.id === over.id)
    if (from < 0 || to < 0) return
    save(arrayMove([...options], from, to))
  }
  const nameOf = (id: string | number) => options.find((o) => o.id === id)?.name ?? ''
  const add = () => {
    const name = draft.trim()
    if (name === '' || options.length >= DB_LIMITS.optionsPerColumn) return
    setDraft('')
    void api.addOption(column.id, name)
  }
  return (
    <div className={s.section} data-testid="db-options-editor">
      <div className={s.sectionTitle}>{th.database.columnMenu.options}</div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
        accessibility={dndAccessibility((id) => nameOf(id))}
      >
        <SortableContext items={options.map((o) => o.id)} strategy={verticalListSortingStrategy}>
          {options.map((o) => (
            <OptionRow
              key={o.id}
              option={o}
              onRename={(name) => save(options.map((x) => (x.id === o.id ? { ...x, name } : x)))}
              onColor={(color) => save(options.map((x) => (x.id === o.id ? { ...x, color } : x)))}
              onDelete={() => save(options.filter((x) => x.id !== o.id))}
            />
          ))}
        </SortableContext>
      </DndContext>
      <TextField
        size="small"
        placeholder={th.database.columnMenu.addOption}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          keepKeys(e)
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            add()
          }
        }}
        slotProps={{
          htmlInput: { 'aria-label': th.database.columnMenu.addOption, maxLength: DB_LIMITS.name },
        }}
      />
    </div>
  )
}

function OptionRow(p: {
  option: SelectOption
  onRename: (name: string) => void
  onColor: (c: OptionColor) => void
  onDelete: () => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({
    id: p.option.id,
  })
  const [name, setName] = useState(p.option.name)
  const [prev, setPrev] = useState(p.option.name)
  if (prev !== p.option.name) {
    setPrev(p.option.name)
    setName(p.option.name)
  }
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null)
  const commit = () => {
    const n = name.trim()
    if (n === '' || n === p.option.name) setName(p.option.name)
    else p.onRename(n)
  }
  const colors = th.database.columnMenu.colors
  return (
    <div
      ref={setNodeRef}
      className={s.row}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="db-option-row"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={s.handle}
        aria-label={`${th.database.columnMenu.dragOption} ${p.option.name}`}
        {...attributes}
        {...listeners}
      >
        <DragIndicator fontSize="small" />
      </button>
      <IconButton
        size="small"
        aria-label={`${th.database.columnMenu.optionColor}: ${colors[p.option.color]}`}
        onClick={(e) => setColorAnchor(e.currentTarget)}
      >
        <span className={s.swatch} data-color={p.option.color} />
      </IconButton>
      <TextField
        className={s.grow}
        size="small"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          keepKeys(e)
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            commit()
          }
        }}
        slotProps={{ htmlInput: { 'aria-label': th.database.columnMenu.options, maxLength: DB_LIMITS.name } }}
      />
      <IconButton
        size="small"
        aria-label={`${th.database.columnMenu.deleteOption} ${p.option.name}`}
        onClick={p.onDelete}
      >
        <DeleteOutlined fontSize="small" />
      </IconButton>
      <Menu anchorEl={colorAnchor} open={colorAnchor !== null} onClose={() => setColorAnchor(null)}>
        {OPTION_COLORS.map((c) => (
          <MenuItem
            key={c}
            selected={c === p.option.color}
            onClick={() => {
              setColorAnchor(null)
              if (c !== p.option.color) p.onColor(c)
            }}
          >
            <ListItemIcon>
              <span className={s.swatch} data-color={c} />
            </ListItemIcon>
            {colors[c]}
          </MenuItem>
        ))}
      </Menu>
    </div>
  )
}
