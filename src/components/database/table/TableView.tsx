'use client'
// src/components/database/table/TableView.tsx — the table view of a database (SPEC §4.14.3, §8.11, M11-D22): a
// `role="grid"` of plain elements (no MUI per cell, PLAN §3.9) with roving focus; title column pinned left; rows
// virtualised above 50 (TanStack Virtual, spacer rows so dnd-kit keeps working); in-cell editing (click / Enter /
// type-to-replace); full keyboard (useTableKeyboard); row checkboxes + Shift range + "ลบ"; row drag by handle when
// the view has no sorts; header drag reorders columns for the whole database; widths 80–600 saved on pointer-up;
// "+ แถวใหม่" inherits the view's "is" filters (FR-1423); footer "N แถว" / "N จาก M แถว". Read-only: no editing,
// checkboxes, handles, menus or "+" (FR-1461).
import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { restrictToHorizontalAxis, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Add from '@mui/icons-material/Add'
import DragIndicator from '@mui/icons-material/DragIndicator'
import NorthEastOutlined from '@mui/icons-material/NorthEastOutlined'
import OpenInFull from '@mui/icons-material/OpenInFull'
import Button from '@mui/material/Button'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  type CSSProperties,
  type JSX,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Link from '@/components/Link'
import {
  DB_LIMITS,
  isFilterComplete,
  liveConfig,
  rowValue,
  valuesFromFilters,
  visibleColumns,
} from '@/domain/database'
import type { DbCtx } from '@/domain/types'
import { th } from '@/i18n/th'
import type { CellValue, DbColumnDTO, DbRowDTO } from '@/lib/contracts/databases'
import { previousId, sameDbId } from '@/lib/database/optimistic'
import { rowPageHref } from '@/lib/database/row-param'
import { CellDisplay } from '../cells/CellDisplay'
import { CellEditor, type EditorDone } from '../cells/CellEditor'
import { usePersonLookup } from '../cells/people'
import { TypeIcon } from '../cells/typeIcons'
import { useDbApi } from '../data/contract'
import { dndAccessibility, useDbSensors } from '../dnd'
import { AddColumnMenu } from '../menus/AddColumnMenu'
import { ColumnMenu } from '../menus/ColumnMenu'
import type { DatabaseViewProps } from '../view-registry'
import s from './TableView.module.css'
import { type CellPos, useTableKeyboard } from './useTableKeyboard'
import { useRowSelection } from './useRowSelection'

export const ROW_H = 34
const ROW_H_NARROW = 36
const LEAD_W = 56
const TITLE_W = 280
const DEFAULT_W = 180
/** FR-1420: virtualise above 50 rows. */
export const VIRTUAL_FROM = 50
const TEXT_EDITORS = new Set(['TITLE', 'TEXT', 'NUMBER', 'URL', 'DATE'])

export interface TableViewProps extends DatabaseViewProps {
  /** The column menu's "กรอง" (the block adds the filter and opens the filter menu). */
  onFilterColumn?: (columnId: string) => void
}

interface Editing {
  rowId: string
  colId: string
  initialText?: string
}

const clampWidth = (w: number) => Math.max(DB_LIMITS.widthMin, Math.min(DB_LIMITS.widthMax, Math.round(w)))

export function TableView(p: TableViewProps): JSX.Element {
  const api = useDbApi()
  const people = usePersonLookup()
  const { view, rows } = p
  const db = api.db
  const cols = useMemo(() => visibleColumns(db.columns, view), [db.columns, view])
  const live = useMemo(() => liveConfig(view.config, db.columns), [view.config, db.columns])
  const ctx = useMemo<DbCtx>(
    () => ({ people: new Map(Object.entries(db.people)), viewerId: api.viewerId, today: api.today }),
    [db.people, api.viewerId, api.today],
  )
  const canEdit = api.canEdit
  const sorted = (live.sorts?.length ?? 0) > 0
  const filtered = (live.filters ?? []).some((f) => {
    const c = db.columns.find((x) => x.id === f.columnId)
    return c !== undefined && isFilterComplete(f, c)
  })
  const order = useMemo(() => rows.map((r) => r.id), [rows])
  const selection = useRowSelection(order)

  // ── widths (FR-1425) ──
  const [resizing, setResizing] = useState<{ colId: string; width: number } | null>(null)
  const widthOf = (c: DbColumnDTO): number =>
    resizing?.colId === c.id
      ? resizing.width
      : (live.columnWidths?.[c.id] ?? (c.type === 'TITLE' ? TITLE_W : DEFAULT_W))
  const totalWidth = LEAD_W + cols.reduce((sum, c) => sum + widthOf(c), 0) + (canEdit ? 40 : 0)

  // ── focus / editing ──
  const [active, setActiveState] = useState<CellPos>({ row: 0, col: 0 })
  const [editing, setEditing] = useState<Editing | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const setActive = useCallback((pos: CellPos) => {
    setActiveState(pos)
    setFocusTick((n) => n + 1)
  }, [])
  const maxRow = canEdit ? rows.length : Math.max(0, rows.length - 1)
  const act = { row: Math.min(active.row, maxRow), col: Math.min(active.col, Math.max(0, cols.length - 1)) }

  // ── virtualisation (M11-D22) ──
  const virtual = rows.length > VIRTUAL_FROM
  const rowH = p.narrow ? ROW_H_NARROW : ROW_H
  const rv = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 10,
    useFlushSync: false,
    getItemKey: (i) => rows[i]?.id ?? i,
  })
  const items = virtual ? rv.getVirtualItems() : []
  const shown: { row: DbRowDTO; index: number }[] = virtual
    ? items.map((it) => ({ row: rows[it.index]!, index: it.index }))
    : rows.map((row, index) => ({ row, index }))
  const padTop = virtual && items.length > 0 ? items[0]!.start : 0
  const padBottom = virtual && items.length > 0 ? rv.getTotalSize() - items[items.length - 1]!.end : 0

  useLayoutEffect(() => {
    if (focusTick === 0) return
    if (virtual && act.row < rows.length) rv.scrollToIndex(act.row, { align: 'auto' })
    const sel = act.row >= rows.length ? '[data-cell="new"]' : `[data-cell="${act.row}:${act.col}"]`
    const el = gridRef.current?.querySelector<HTMLElement>(sel)
    if (el && document.activeElement !== el && !el.contains(document.activeElement))
      el.focus({ preventScroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per explicit focus request only
  }, [focusTick])

  // a row created here (new row / Enter on the last row): once it is in the view, focus (and edit) its title —
  // adjusted during render (no effect): the create resolves before or after the optimistic rows arrive
  const [pending, setPending] = useState<{ rowId: string; edit: boolean } | null>(null)
  if (pending) {
    const i = rows.findIndex((r) => sameDbId(r.id, pending.rowId))
    if (i >= 0) {
      const titleCol = Math.max(
        0,
        cols.findIndex((c) => c.type === 'TITLE'),
      )
      setPending(null)
      setActiveState({ row: i, col: titleCol })
      setFocusTick((n) => n + 1)
      if (pending.edit) setEditing({ rowId: rows[i]!.id, colId: cols[titleCol]!.id })
    }
  }

  const createRow = useCallback(() => {
    if (!canEdit) return
    const inherited = valuesFromFilters(live.filters ?? [], db.columns, ctx)
    void api
      .createRows([
        {
          ...(inherited.title !== undefined ? { title: inherited.title } : {}),
          ...(Object.keys(inherited.cells).length > 0 ? { cells: inherited.cells } : {}),
        },
      ])
      .then(([id]) => {
        if (id) setPending({ rowId: id, edit: true })
      })
  }, [api, canEdit, ctx, db.columns, live.filters])

  const write = useCallback(
    (row: DbRowDTO, col: DbColumnDTO, v: CellValue | null) => {
      if (col.type === 'TITLE') api.updateRow(row.id, { title: typeof v === 'string' ? v : '' })
      else api.updateRow(row.id, { cells: { [col.id]: v } })
    },
    [api],
  )
  const toggle = (pos: CellPos) => {
    const row = rows[pos.row]
    const col = cols[pos.col]
    if (!row || !col || col.type !== 'CHECKBOX' || !canEdit) return
    write(row, col, rowValue(row, col) === true ? null : true)
  }
  const clear = (pos: CellPos) => {
    const row = rows[pos.row]
    const col = cols[pos.col]
    if (!row || !col) return
    if (col.type === 'TITLE') {
      if (row.title !== '') write(row, col, '')
    } else if (rowValue(row, col) !== null) write(row, col, null)
  }
  const startEdit = (pos: CellPos, initialText?: string) => {
    const row = rows[pos.row]
    const col = cols[pos.col]
    if (!row || !col || !canEdit || col.type === 'CHECKBOX') return
    setActiveState(pos)
    setEditing({ rowId: row.id, colId: col.id, ...(initialText !== undefined ? { initialText } : {}) })
  }
  const deleteSelected = () => {
    const ids = [...selection.selected]
    if (ids.length === 0) return
    selection.clear()
    api.deleteRows(ids)
  }

  const onEditorDone = (pos: CellPos, colType: string, reason: EditorDone) => {
    setEditing(null)
    if (reason === 'blur') return
    if (reason === 'tab' || reason === 'shiftTab') {
      const back = reason === 'shiftTab'
      let { row, col } = pos
      col += back ? -1 : 1
      if (col >= cols.length) {
        col = 0
        row += 1
      } else if (col < 0) {
        col = cols.length - 1
        row -= 1
      }
      setActive({ row: Math.max(0, Math.min(rows.length - 1, row)), col })
      return
    }
    if (reason === 'enter' && TEXT_EDITORS.has(colType) && pos.row === rows.length - 1 && !sorted) {
      createRow() // FR-1422: Enter after confirming in the last row → a new row, caret in its title
      return
    }
    setActive(pos)
  }

  const onKeyDown = useTableKeyboard({
    rowCount: rows.length,
    colCount: cols.length,
    hasNewRow: canEdit,
    canEdit,
    active: act,
    setActive,
    typeAt: (c) => cols[c]?.type ?? 'TEXT',
    edit: startEdit,
    toggle,
    clear,
    open: (r) => {
      const row = rows[r]
      if (row) p.openRow(row.id)
    },
    createRow,
    hasSelection: selection.selected.size > 0,
    clearSelection: selection.clear,
    deleteSelected,
    moveRow: (r, delta) => {
      // keyboard alternative to the row handle (§8.9): Alt+Shift+↑/↓, only without sorts (FR-1426)
      const row = rows[r]
      const to = r + delta
      if (!rowDrag || !row || to < 0 || to >= rows.length) return
      const target = rows[to]!
      api.updateRow(row.id, { move: { afterRowId: delta < 0 ? previousId(db.rows, target.id) : target.id } })
      setActive({ row: to, col: act.col })
    },
  })

  // ── column header menus (FR-1411/1412) ──
  const [menu, setMenu] = useState<{ colId: string; focusName: boolean } | null>(null)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null)
  const headRefs = useRef(new Map<string, HTMLElement>())
  useEffect(() => {
    if (!menu || menuAnchor) return
    const el = [...headRefs.current.entries()].find(([id]) => sameDbId(id, menu.colId))?.[1]
    if (el) setMenuAnchor(el)
  }, [menu, menuAnchor, cols])
  const openMenu = (colId: string, focusName: boolean) => {
    setMenuAnchor(null)
    setMenu({ colId, focusName })
  }

  // ── drag: columns (database order, FR-1413) and rows (manual order, FR-1426) ──
  const sensors = useDbSensors()
  const dragCols = cols.filter((c) => c.type !== 'TITLE')
  const onColumnDragEnd = ({ active: a, over }: DragEndEvent) => {
    if (!over || a.id === over.id) return
    const from = dragCols.findIndex((c) => c.id === a.id)
    const to = dragCols.findIndex((c) => c.id === over.id)
    if (from < 0 || to < 0) return
    const target = dragCols[to]!
    const after = to < from ? previousId(db.columns, target.id) : target.id
    api.updateColumn(String(a.id), { afterColumnId: after })
  }
  const rowDrag = canEdit && !sorted
  const onRowDragEnd = ({ active: a, over }: DragEndEvent) => {
    if (!over || a.id === over.id) return
    const from = rows.findIndex((r) => r.id === a.id)
    const to = rows.findIndex((r) => r.id === over.id)
    if (from < 0 || to < 0) return
    const target = rows[to]!
    // the dropped row lands right before (moving up) or right after (moving down) the target, in database order
    const after = to < from ? previousId(db.rows, target.id) : target.id
    api.updateRow(String(a.id), { move: { afterRowId: after } })
  }

  // ── resize (FR-1425): live width while dragging, one updateDatabaseView on pointer-up ──
  const saveWidth = (colId: string, width: number) => {
    const w = clampWidth(width)
    if (live.columnWidths?.[colId] === w) return
    api.updateView(view.id, {
      config: { ...view.config, columnWidths: { ...(view.config.columnWidths ?? {}), [colId]: w } },
    })
  }
  const onResizeStart = (col: DbColumnDTO) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widthOf(col)
    let last = startW
    const move = (ev: PointerEvent) => {
      last = clampWidth(startW + ev.clientX - startX)
      setResizing({ colId: col.id, width: last })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setResizing(null)
      if (last !== startW) saveWidth(col.id, last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const nameOfCol = (id: string | number) => db.columns.find((c) => c.id === id)?.name ?? ''
  const nameOfRow = (id: string | number) => {
    const r = db.rows.find((x) => x.id === id)
    return r ? r.title || th.database.table.untitledRow : ''
  }
  const t = th.database.table

  return (
    <div className={s.wrap} data-testid="db-table">
      {selection.selected.size > 0 && canEdit ? (
        <div className={s.selectionBar} role="status">
          <span>{t.selected(selection.selected.size)}</span>
          <Button size="small" color="inherit" onClick={deleteSelected}>
            {t.deleteSelected}
          </Button>
        </div>
      ) : null}
      <div ref={scrollRef} className={s.scroller} data-virtual={virtual}>
        <div
          ref={gridRef}
          role="grid"
          aria-label={t.label}
          aria-rowcount={rows.length + 1}
          aria-colcount={cols.length}
          aria-multiselectable={canEdit || undefined}
          className={s.grid}
          style={{ width: totalWidth }}
          onKeyDown={(e) => {
            // only keys on a cell / "+ แถวใหม่" drive the grid (not the header buttons, not an open editor)
            if (editing || !(e.target instanceof HTMLElement) || !e.target.closest('[data-cell]')) return
            onKeyDown(e)
          }}
        >
          <div role="row" aria-rowindex={1} className={`${s.row} ${s.header}`}>
            <div className={s.lead} role="presentation">
              {canEdit && rows.length > 0 ? (
                <input
                  type="checkbox"
                  className={s.select}
                  aria-label={t.selectAll}
                  checked={selection.allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = selection.someSelected
                  }}
                  onChange={(e) => selection.setAll(e.target.checked)}
                />
              ) : null}
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToHorizontalAxis]}
              onDragEnd={onColumnDragEnd}
              accessibility={dndAccessibility(nameOfCol)}
            >
              <SortableContext items={dragCols.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
                {cols.map((col, c) => (
                  <HeaderCell
                    key={col.id}
                    column={col}
                    colIndex={c}
                    width={widthOf(col)}
                    canEdit={canEdit}
                    resizing={resizing?.colId === col.id}
                    registerRef={(el) => {
                      if (el) headRefs.current.set(col.id, el)
                      else headRefs.current.delete(col.id)
                    }}
                    onOpenMenu={() => openMenu(col.id, false)}
                    onResizeStart={onResizeStart(col)}
                    onResizeKey={(delta) => saveWidth(col.id, widthOf(col) + delta)}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {canEdit ? (
              <div className={s.addColumn}>
                <button
                  type="button"
                  className={s.iconBtn}
                  aria-label={t.addColumn}
                  title={t.addColumn}
                  onClick={(e) => setAddAnchor(e.currentTarget)}
                >
                  <Add fontSize="inherit" />
                </button>
              </div>
            ) : null}
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onRowDragEnd}
            accessibility={dndAccessibility(nameOfRow)}
          >
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div role="rowgroup">
                {padTop > 0 ? (
                  <div className={s.spacer} style={{ height: padTop }} aria-hidden="true" />
                ) : null}
                {shown.map(({ row, index }) => (
                  <RowView
                    key={row.id}
                    row={row}
                    index={index}
                    cols={cols}
                    widthOf={widthOf}
                    canEdit={canEdit}
                    rowDrag={rowDrag}
                    selected={selection.isSelected(row.id)}
                    onSelect={(range) => selection.toggle(row.id, range)}
                    active={act.row === index ? act.col : -1}
                    editing={editing && sameDbId(editing.rowId, row.id) ? editing : null}
                    people={people}
                    today={api.today}
                    onCellClick={(c, e) => {
                      const col = cols[c]!
                      if (col.type === 'CHECKBOX') {
                        setActive({ row: index, col: c })
                        toggle({ row: index, col: c })
                      } else if (canEdit && !(e.target as HTMLElement).closest('a,button')) {
                        startEdit({ row: index, col: c })
                      } else setActive({ row: index, col: c })
                    }}
                    onCellFocus={(c) => {
                      if (act.row !== index || act.col !== c) setActiveState({ row: index, col: c })
                    }}
                    onCommit={(col, v) => write(row, col, v)}
                    onDone={(c, reason) => onEditorDone({ row: index, col: c }, cols[c]!.type, reason)}
                    createOption={(colId, name) => api.addOption(colId, name)}
                    onOpen={() => p.openRow(row.id)}
                  />
                ))}
                {padBottom > 0 ? (
                  <div className={s.spacer} style={{ height: padBottom }} aria-hidden="true" />
                ) : null}
              </div>
            </SortableContext>
          </DndContext>
          {rows.length === 0 ? (
            <div className={s.empty} role="row">
              <span role="gridcell">{filtered ? t.noMatch : t.empty}</span>
            </div>
          ) : null}
          {canEdit ? (
            <div role="row" aria-rowindex={rows.length + 2} className={s.newRow}>
              <button
                type="button"
                role="gridcell"
                data-cell="new"
                className={s.newRowButton}
                data-active={act.row === rows.length || undefined}
                tabIndex={act.row === rows.length || rows.length === 0 ? 0 : -1}
                disabled={db.rows.length >= DB_LIMITS.rows}
                onClick={() => {
                  setActiveState({ row: rows.length, col: 0 })
                  createRow()
                }}
              >
                {t.newRow}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className={s.footer} aria-live="polite">
        {filtered ? t.countOf(rows.length, db.rows.length) : t.count(rows.length)}
      </div>
      {menu ? (
        <ColumnMenu
          anchorEl={menuAnchor}
          columnId={menu.colId}
          view={view}
          focusName={menu.focusName}
          onClose={() => {
            setMenu(null)
            setMenuAnchor(null)
          }}
          {...(p.onFilterColumn ? { onFilter: p.onFilterColumn } : {})}
          onInserted={(id) => openMenu(id, true)}
        />
      ) : null}
      <AddColumnMenu
        anchorEl={addAnchor}
        onClose={() => setAddAnchor(null)}
        onCreated={(id) => openMenu(id, true)}
      />
    </div>
  )
}

function HeaderCell(p: {
  column: DbColumnDTO
  colIndex: number
  width: number
  canEdit: boolean
  resizing: boolean
  registerRef: (el: HTMLElement | null) => void
  onOpenMenu: () => void
  onResizeStart: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onResizeKey: (delta: number) => void
}): JSX.Element {
  const { column } = p
  const isTitle = column.type === 'TITLE'
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: column.id,
      disabled: !p.canEdit || isTitle,
    })
  const style: CSSProperties = {
    width: p.width,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 5, opacity: 0.85 } : {}),
  }
  const ref = (el: HTMLDivElement | null) => {
    setNodeRef(el)
    p.registerRef(el)
  }
  return (
    <div
      ref={ref}
      role="columnheader"
      aria-colindex={p.colIndex + 1}
      className={`${s.headCell}${isTitle ? ` ${s.titleCell}` : ''}`}
      style={style}
      data-col-id={column.id}
    >
      {p.canEdit && !isTitle ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={`${s.iconBtn} ${s.handle}`}
          aria-label={`${th.database.table.dragColumn} ${column.name}`}
          {...attributes}
          {...listeners}
        >
          <DragIndicator fontSize="inherit" />
        </button>
      ) : null}
      <button
        type="button"
        className={s.headButton}
        disabled={!p.canEdit}
        aria-haspopup={p.canEdit ? 'dialog' : undefined}
        aria-label={p.canEdit ? th.database.columnMenu.label(column.name) : undefined}
        title={th.database.types[column.type]}
        onClick={p.onOpenMenu}
      >
        <span className={s.headIcon}>
          <TypeIcon type={column.type} />
        </span>
        <span className={s.headLabel}>{column.name}</span>
      </button>
      {p.canEdit ? (
        <button
          type="button"
          className={s.resize}
          data-active={p.resizing || undefined}
          aria-label={`${th.database.table.resizeColumn} ${column.name}`}
          title={th.database.table.resizeColumn}
          onPointerDown={p.onResizeStart}
          onKeyDown={(e) => {
            if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
              e.preventDefault()
              p.onResizeKey(-20)
            } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
              e.preventDefault()
              p.onResizeKey(20)
            }
          }}
        />
      ) : null}
    </div>
  )
}

interface RowViewProps {
  row: DbRowDTO
  index: number
  cols: DbColumnDTO[]
  widthOf: (c: DbColumnDTO) => number
  canEdit: boolean
  rowDrag: boolean
  selected: boolean
  onSelect: (range: boolean) => void
  /** The active column index on this row, -1 when the active cell is elsewhere. */
  active: number
  editing: Editing | null
  people: ReturnType<typeof usePersonLookup>
  today: string
  onCellClick: (col: number, e: MouseEvent) => void
  /** A cell got focus (Tab / click / programmatic): it becomes the active cell. */
  onCellFocus: (col: number) => void
  onCommit: (col: DbColumnDTO, v: CellValue | null) => void
  onDone: (col: number, reason: EditorDone) => void
  createOption: (colId: string, name: string) => Promise<string>
  onOpen: () => void
}

function RowView(p: RowViewProps): JSX.Element {
  const { row } = p
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: row.id,
      disabled: !p.rowDrag,
    })
  const t = th.database.table
  return (
    <div
      ref={setNodeRef}
      role="row"
      aria-rowindex={p.index + 2}
      aria-selected={p.canEdit ? p.selected : undefined}
      className={s.row}
      data-row-id={row.id}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className={s.lead} role="presentation">
        {p.canEdit ? (
          <>
            <button
              type="button"
              ref={setActivatorNodeRef}
              className={`${s.iconBtn} ${s.handle}`}
              aria-label={t.dragRow}
              title={t.dragRow}
              disabled={!p.rowDrag}
              {...attributes}
              {...listeners}
              tabIndex={-1}
            >
              <DragIndicator fontSize="inherit" />
            </button>
            <input
              type="checkbox"
              className={s.select}
              data-checked={p.selected}
              aria-label={`${t.selectRow} ${row.title || t.untitledRow}`}
              checked={p.selected}
              tabIndex={-1}
              onChange={() => undefined}
              onClick={(e) => p.onSelect(e.shiftKey)}
            />
          </>
        ) : null}
      </div>
      {p.cols.map((col, c) => {
        const isTitle = col.type === 'TITLE'
        const editing = p.editing && sameDbId(p.editing.colId, col.id) ? p.editing : null
        const editable = p.canEdit && col.type !== 'CHECKBOX'
        return (
          <div
            key={col.id}
            role="gridcell"
            aria-colindex={c + 1}
            tabIndex={p.active === c ? 0 : -1}
            className={`${s.cell}${isTitle ? ` ${s.titleCell}` : ''}`}
            style={{ width: p.widthOf(col) }}
            data-cell={`${p.index}:${c}`}
            data-type={col.type}
            data-active={p.active === c || undefined}
            data-editing={editing ? 'true' : undefined}
            data-editable={editable || undefined}
            aria-readonly={!editable || undefined}
            onClick={(e) => {
              if (!editing) p.onCellClick(c, e)
            }}
            onFocus={(e) => {
              if (e.target === e.currentTarget) p.onCellFocus(c)
            }}
          >
            {isTitle ? (
              <>
                <span className={s.titleText}>
                  <CellDisplay column={col} row={row} people={p.people} />
                </span>
                <span className={s.rowActions}>
                  <button
                    type="button"
                    className={s.iconBtn}
                    aria-label={`${t.openRow} ${row.title || t.untitledRow}`}
                    title={th.database.panel.label}
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation()
                      p.onOpen()
                    }}
                  >
                    <OpenInFull fontSize="inherit" />
                  </button>
                  <Link
                    href={rowPageHref(row.id)}
                    className={s.iconBtn}
                    aria-label={`${t.openAsPage} ${row.title || t.untitledRow}`}
                    title={t.openAsPage}
                    tabIndex={-1}
                    onClick={(e: MouseEvent) => e.stopPropagation()}
                  >
                    <NorthEastOutlined fontSize="inherit" />
                  </Link>
                </span>
              </>
            ) : (
              <CellDisplay column={col} row={row} people={p.people} />
            )}
            {editing ? (
              <div
                className={s.overlay}
                data-wide={!TEXT_EDITORS.has(col.type) || col.type === 'TEXT' || undefined}
              >
                <CellEditor
                  column={col}
                  row={row}
                  {...(editing.initialText !== undefined ? { initialText: editing.initialText } : {})}
                  label={col.name}
                  people={p.people}
                  today={p.today}
                  onCommit={(v) => p.onCommit(col, v)}
                  onDone={(reason) => p.onDone(c, reason)}
                  {...(col.type === 'SELECT' || col.type === 'MULTI_SELECT'
                    ? { createOption: (name: string) => p.createOption(col.id, name) }
                    : {})}
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
