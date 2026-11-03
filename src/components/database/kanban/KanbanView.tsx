'use client'
// src/components/database/kanban/KanbanView.tsx — the kanban view of a database (SPEC §4.14 FR-1430…1435, §8.11;
// BR-96; M11-D24/D31/D39). Groups by the view's SELECT / PERSON / CHECKBOX column (domain groupRows: option order
// then "ไม่มีค่า", people by name, ติ๊กแล้ว / ยังไม่ติ๊ก) with a count per group; a multi-person row has a card in every
// person's group. Cards: title + 📄 + the view's card properties; click → the row panel. Moving a card (dnd-kit pointer
// or keyboard drag, or the card's ⋯ "ย้ายไป…" — the only way on phones) writes the group value (domain dropOnGroup)
// and, when the view has no sorts, the position, in ONE updateRow. "+ เพิ่ม" per group creates a row with the group's
// value and keeps the input for the next card; "+ เพิ่มกลุ่ม" (SELECT) adds an option. Plain elements + CSS Modules
// (dense view, PLAN §3.9); the board scrolls sideways inside the block.
import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type UniqueIdentifier,
  useDroppable,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Check from '@mui/icons-material/Check'
import DragIndicator from '@mui/icons-material/DragIndicator'
import MoreHoriz from '@mui/icons-material/MoreHoriz'
import Button from '@mui/material/Button'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { type JSX, type PointerEventHandler, useMemo, useRef, useState } from 'react'
import {
  type DbColumnLike,
  dropOnGroup,
  type GroupKey,
  groupKeyId,
  groupRows,
  liveConfig,
  valuesFromFilters,
} from '@/domain/database'
import type { DbRowModel, OptionColor } from '@/domain/types'
import { th } from '@/i18n/th'
import type { CellValue, DbColumnDTO, DbRowDTO, DbViewDTO } from '@/lib/contracts/databases'
import { displayName } from '@/lib/display-name'
import { CheckMark } from '../cells/CellDisplay'
import { OptionChip, PersonChip } from '../cells/Chips'
import { type PersonLookup, usePersonLookup } from '../cells/people'
import { useDbApi } from '../data/contract'
import { useRowMenu } from '../menus/RowMenu'
import { dndAccessibility, useDbSensors } from '../dnd'
import type { DatabaseViewMenuProps, DatabaseViewProps } from '../view-registry'
import { CardContent, CardPropertyItems, useDbCtx } from './card'
import s from './kanban.module.css'

const GROUPABLE = new Set<DbColumnDTO['type']>(['SELECT', 'PERSON', 'CHECKBOX'])

// ── pure drop planning (exported for tests) ──────────────────────────────────────────────────────────────────────

export interface PlannedDrop {
  cells?: Record<string, CellValue | null>
  move?: { afterRowId: string | null }
}

/**
 * BR-96 + M11-D18: what dropping the card of `rowId` from group index `from` onto group `to` writes — the group value
 * (domain dropOnGroup) when the group changes, and without sorts the position: before the card it lands on
 * (`overRowId`; after it when moving down inside the same group), after the group's last card when dropped on the
 * group itself (nothing for an empty group), `null` = first. Null = nothing to write.
 */
export function planKanbanDrop(p: {
  groups: readonly { key: GroupKey; rows: readonly DbRowModel[] }[]
  col: DbColumnLike
  hasSorts: boolean
  rowId: string
  from: number
  to: number
  overRowId: string | null
}): PlannedDrop | null {
  const src = p.groups[p.from]
  const dst = p.groups[p.to]
  const row = src?.rows.find((r) => r.id === p.rowId)
  if (!src || !dst || !row) return null
  const out: PlannedDrop = {}
  if (p.from !== p.to) out.cells = { [p.col.id]: dropOnGroup(row, p.col, src.key, dst.key) }
  if (!p.hasSorts) {
    const ids = dst.rows.map((r) => r.id)
    let after: string | null | undefined
    if (p.from === p.to) {
      if (p.overRowId === null || p.overRowId === p.rowId) return out.cells ? out : null
      const moved = arrayMove(ids, ids.indexOf(p.rowId), ids.indexOf(p.overRowId))
      const at = moved.indexOf(p.rowId)
      after = at > 0 ? moved[at - 1]! : null
    } else {
      const rest = ids.filter((id) => id !== p.rowId)
      if (p.overRowId === null) after = rest.length > 0 ? rest[rest.length - 1]! : undefined
      else {
        const at = rest.indexOf(p.overRowId)
        after = at > 0 ? rest[at - 1]! : at === 0 ? null : undefined
      }
    }
    if (after !== undefined) out.move = { afterRowId: after }
  }
  return out.cells || out.move ? out : null
}

/** The value a new card of a group starts with (FR-1434): option id, `[person]`, `true`; none / unchecked → null. */
function groupValue(key: GroupKey): CellValue | null {
  if (key.kind === 'option') return key.id
  if (key.kind === 'person') return [key.id]
  if (key.kind === 'checked') return true
  return null
}

function groupName(key: GroupKey, label: string | null, people: PersonLookup): string {
  const k = th.database.kanban
  switch (key.kind) {
    case 'option':
      return label ?? ''
    case 'person': {
      const ref = people(key.id)
      return ref ? displayName(ref) : (label ?? th.database.cells.unknownPerson)
    }
    case 'checked':
      return k.checked
    case 'unchecked':
      return k.unchecked
    case 'none':
      return k.noValue
  }
}

// dnd ids: a card `c|<group>|<row>` (a multi-person row has one card per group), a group `g|<group>`
const cardDndId = (gid: string, rowId: string) => `c|${gid}|${rowId}`
const groupDndId = (gid: string) => `g|${gid}`
function parseDndId(id: UniqueIdentifier): { gid: string; rowId: string | null } | null {
  const parts = String(id).split('|')
  if (parts[0] === 'c' && parts.length === 3) return { gid: parts[1]!, rowId: parts[2]! }
  if (parts[0] === 'g' && parts.length === 2) return { gid: parts[1]!, rowId: null }
  return null
}

// ── view ─────────────────────────────────────────────────────────────────────────────────────────────────────────

interface BoardGroup {
  id: string
  key: GroupKey
  name: string
  label: string | null
  color: OptionColor | null
  rows: DbRowDTO[]
}

export function KanbanView({ view, rows, openRow, narrow }: DatabaseViewProps): JSX.Element {
  const api = useDbApi()
  const ctx = useDbCtx()
  const people = usePersonLookup()
  const live = useMemo(() => liveConfig(view.config, api.db.columns), [view.config, api.db.columns])
  const col = api.db.columns.find((c) => c.id === live.groupByColumnId)
  const result = useMemo(
    () => groupRows(rows, { config: live }, api.db.columns, ctx),
    [rows, live, api.db.columns, ctx],
  )
  const groups = useMemo<BoardGroup[]>(
    () =>
      result.ok
        ? result.groups.map((g) => ({
            id: groupKeyId(g.key),
            key: g.key,
            name: groupName(g.key, g.label, people),
            label: g.label,
            color: g.color,
            rows: g.rows,
          }))
        : [],
    [result, people],
  )
  const sensors = useDbSensors()
  const [active, setActive] = useState<{ gid: string; rowId: string } | null>(null)

  if (!result.ok || !col) return <GroupColumnPrompt view={view} />

  const canDrag = api.canEdit && !narrow
  const hasSorts = (live.sorts?.length ?? 0) > 0
  const rowById = new Map(rows.map((r) => [r.id, r]))
  const nameOf = (id: UniqueIdentifier) => {
    const p = parseDndId(id)
    if (!p) return ''
    if (p.rowId !== null) return rowById.get(p.rowId)?.title || th.database.table.untitledRow
    return groups.find((g) => g.id === p.gid)?.name ?? ''
  }

  /** `position: false` = "ย้ายไป…": the value only, the card keeps its place in the order. */
  const move = (rowId: string, from: number, to: number, overRowId: string | null, position = true) => {
    const plan = planKanbanDrop({ groups, col, hasSorts: hasSorts || !position, rowId, from, to, overRowId })
    if (plan) api.updateRow(rowId, plan, undefined, { toast: th.database.toasts.moved })
  }
  const onDragStart = (e: DragStartEvent) => {
    const p = parseDndId(e.active.id)
    setActive(p && p.rowId !== null ? { gid: p.gid, rowId: p.rowId } : null)
  }
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null)
    const a = parseDndId(e.active.id)
    const o = e.over ? parseDndId(e.over.id) : null
    if (!a || a.rowId === null || !o) return
    const from = groups.findIndex((g) => g.id === a.gid)
    const to = groups.findIndex((g) => g.id === o.gid)
    if (from < 0 || to < 0) return
    move(a.rowId, from, to, o.rowId)
  }
  const activeRow = active ? rowById.get(active.rowId) : undefined

  return (
    <div className={s.board} data-testid="db-kanban" aria-label={th.database.kanban.boardLabel(view.name)}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        accessibility={dndAccessibility(nameOf)}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        {groups.map((g, gi) => (
          <KanbanGroup
            key={g.id}
            group={g}
            view={view}
            col={col}
            canDrag={canDrag}
            onOpen={openRow}
            moveTargets={groups}
            onMove={(rowId, to) => move(rowId, gi, to, null, false)}
            onCreate={(title) => {
              const inherited = valuesFromFilters(live.filters ?? [], api.db.columns, ctx)
              const v = groupValue(g.key)
              const cells: Record<string, CellValue> = { ...inherited.cells }
              if (v === null) delete cells[col.id]
              else cells[col.id] = v
              void api.createRows([{ title, ...(Object.keys(cells).length > 0 ? { cells } : {}) }])
            }}
          />
        ))}
        {api.canEdit && col.type === 'SELECT' ? <AddGroup columnId={col.id} /> : null}
        <DragOverlay>
          {activeRow ? (
            <div className={s.card} data-overlay="true" data-row-id={activeRow.id}>
              <div className={s.cardMain}>
                <CardContent row={activeRow} view={view} />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function GroupHeading({ group, people }: { group: BoardGroup; people: PersonLookup }): JSX.Element {
  const k = group.key
  const label =
    k.kind === 'option' ? (
      <OptionChip option={{ name: group.label ?? '', color: group.color ?? 'gray' }} />
    ) : k.kind === 'person' ? (
      <PersonChip person={people(k.id)} />
    ) : k.kind === 'checked' || k.kind === 'unchecked' ? (
      <span className={s.groupText}>
        <CheckMark checked={k.kind === 'checked'} />
        {group.name}
      </span>
    ) : (
      <span className={`${s.groupText} ${s.muted}`}>{group.name}</span>
    )
  return (
    <div className={s.groupHeader} aria-hidden="true">
      {label}
      <span className={s.count}>{group.rows.length}</span>
    </div>
  )
}

function KanbanGroup(p: {
  group: BoardGroup
  view: DbViewDTO
  col: DbColumnDTO
  canDrag: boolean
  moveTargets: readonly BoardGroup[]
  onOpen: (rowId: string) => void
  onMove: (rowId: string, to: number) => void
  onCreate: (title: string) => void
}): JSX.Element {
  const api = useDbApi()
  const people = usePersonLookup()
  const g = p.group
  const { setNodeRef, isOver } = useDroppable({ id: groupDndId(g.id), disabled: !p.canDrag })
  const [adding, setAdding] = useState(false)
  return (
    <section
      className={s.group}
      aria-label={th.database.kanban.groupCount(g.name, g.rows.length)}
      data-group={g.id}
    >
      <GroupHeading group={g} people={people} />
      <SortableContext
        items={g.rows.map((r) => cardDndId(g.id, r.id))}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setNodeRef} className={s.list} data-over={isOver || undefined} data-testid="db-kanban-list">
          {g.rows.map((r) => (
            <KanbanCard
              key={r.id}
              gid={g.id}
              row={r}
              view={p.view}
              group={g}
              canDrag={p.canDrag}
              moveTargets={p.moveTargets}
              onOpen={p.onOpen}
              onMove={p.onMove}
            />
          ))}
        </div>
      </SortableContext>
      {api.canEdit ? (
        adding ? (
          <QuickAdd
            label={th.database.kanban.quickAddLabel(g.name)}
            onSubmit={p.onCreate}
            onClose={() => setAdding(false)}
          />
        ) : (
          <Button size="small" color="inherit" className={s.add} onClick={() => setAdding(true)}>
            {th.database.kanban.add}
          </Button>
        )
      ) : null}
    </section>
  )
}

function KanbanCard(p: {
  gid: string
  row: DbRowDTO
  view: DbViewDTO
  group: BoardGroup
  canDrag: boolean
  moveTargets: readonly BoardGroup[]
  onOpen: (rowId: string) => void
  onMove: (rowId: string, to: number) => void
}): JSX.Element {
  const api = useDbApi()
  const { row } = p
  const title = row.title || th.database.table.untitledRow
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: cardDndId(p.gid, row.id), disabled: !p.canDrag })
  // FR-1424a: right-click / Shift+F10 opens the row menu instead of the browser's
  const rowMenu = useRowMenu({ openRow: p.onOpen })
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const style = { transform: CSS.Translate.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      className={s.card}
      style={style}
      data-testid="db-card"
      data-row-id={row.id}
      data-dragging={isDragging || undefined}
      onPointerDown={p.canDrag ? (listeners?.onPointerDown as PointerEventHandler | undefined) : undefined}
      onContextMenu={(e) => rowMenu.onContextMenu(e, row.id)}
    >
      <button
        type="button"
        className={s.cardMain}
        aria-label={th.database.kanban.openCard(title)}
        onClick={() => p.onOpen(row.id)}
        onKeyDown={(e) => void rowMenu.onKeyDown(e, row.id)}
      >
        <CardContent row={row} view={p.view} />
      </button>
      {api.canEdit ? (
        <div className={s.cardTools}>
          {p.canDrag ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              className={s.tool}
              aria-label={th.database.kanban.dragCard}
              {...attributes}
              {...listeners}
            >
              <DragIndicator fontSize="inherit" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className={s.tool}
            aria-label={th.database.kanban.cardMenu(title)}
            aria-haspopup="menu"
            aria-expanded={menu !== null}
            onClick={(e) => setMenu(e.currentTarget)}
          >
            <MoreHoriz fontSize="inherit" aria-hidden="true" />
          </button>
          <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
            <ListSubheader className={s.menuHeading}>{th.database.kanban.moveTo}</ListSubheader>
            {p.moveTargets.map((t, ti) => {
              const current = t.id === p.group.id
              return (
                <MenuItem
                  key={t.id}
                  disabled={current}
                  onClick={() => {
                    setMenu(null)
                    p.onMove(row.id, ti)
                  }}
                >
                  <ListItemIcon>
                    {current ? <Check fontSize="small" aria-hidden="true" /> : null}
                  </ListItemIcon>
                  <ListItemText>{t.name}</ListItemText>
                </MenuItem>
              )
            })}
          </Menu>
        </div>
      ) : null}
      {rowMenu.menu}
    </div>
  )
}

/** "+ เพิ่ม": a one-line name input; Enter creates and stays for the next card (FR-1434, FR-602); Esc / empty blur closes. */
function QuickAdd(p: { label: string; onSubmit: (title: string) => void; onClose: () => void }): JSX.Element {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  return (
    <input
      ref={ref}
      className={s.quickAdd}
      autoFocus
      value={value}
      aria-label={p.label}
      placeholder={th.database.kanban.quickAddPlaceholder}
      maxLength={500}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const t = value.trim()
        if (t !== '') p.onSubmit(t)
        p.onClose()
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.code === 'Enter' || e.key === 'Enter') {
          e.preventDefault()
          const t = value.trim()
          if (t !== '') p.onSubmit(t)
          setValue('')
          ref.current?.focus()
        } else if (e.code === 'Escape' || e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          setValue('')
          p.onClose()
        }
      }}
    />
  )
}

/** "+ เพิ่มกลุ่ม" (SELECT grouping): a new option of the group column (FR-1434). */
function AddGroup({ columnId }: { columnId: string }): JSX.Element {
  const api = useDbApi()
  const [open, setOpen] = useState(false)
  return (
    <div className={s.addGroup}>
      {open ? (
        <QuickAdd
          label={th.database.kanban.addGroupLabel}
          onSubmit={(name) => void api.addOption(columnId, name)}
          onClose={() => setOpen(false)}
        />
      ) : (
        <Button size="small" color="inherit" onClick={() => setOpen(true)}>
          {th.database.kanban.addGroup}
        </Button>
      )}
    </div>
  )
}

/** No (live) group column (FR-1415 deleted / never chosen): pick one, or create "สถานะ" when none can group. */
function GroupColumnPrompt({ view }: { view: DbViewDTO }): JSX.Element {
  const api = useDbApi()
  const candidates = api.db.columns.filter((c) => GROUPABLE.has(c.type))
  const groupBy = (id: string) => api.updateView(view.id, { config: { ...view.config, groupByColumnId: id } })
  return (
    <div className={s.prompt} data-testid="db-kanban-pick">
      <span>{th.database.kanban.pickGroupColumn}</span>
      {api.canEdit ? (
        <div className={s.promptActions}>
          {candidates.map((c) => (
            <Button key={c.id} size="small" variant="outlined" onClick={() => groupBy(c.id)}>
              {c.name}
            </Button>
          ))}
          {candidates.length === 0 ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() =>
                void api
                  .createColumn('SELECT', { name: th.database.defaults.status })
                  .then((id) => groupBy(id))
              }
            >
              {th.database.kanban.createStatusColumn}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** The kanban part of the view ⋯ menu: จัดกลุ่ม (radio), ซ่อนกลุ่มที่ว่าง, คุณสมบัติบนการ์ด. */
export function KanbanMenuItems({ view }: DatabaseViewMenuProps): JSX.Element {
  const api = useDbApi()
  const candidates = api.db.columns.filter((c) => GROUPABLE.has(c.type))
  const save = (patch: Partial<DbViewDTO['config']>) =>
    api.updateView(view.id, { config: { ...view.config, ...patch } })
  const hide = view.config.hideEmptyGroups === true
  return (
    <>
      <ListSubheader className={s.menuHeading}>{th.database.kanban.groupBy}</ListSubheader>
      {candidates.map((c) => {
        const on = view.config.groupByColumnId === c.id
        return (
          <MenuItem
            key={c.id}
            role="menuitemradio"
            aria-checked={on}
            onClick={() => save({ groupByColumnId: c.id })}
          >
            <ListItemIcon>{on ? <Check fontSize="small" aria-hidden="true" /> : null}</ListItemIcon>
            <ListItemText>{c.name}</ListItemText>
          </MenuItem>
        )
      })}
      <MenuItem role="menuitemcheckbox" aria-checked={hide} onClick={() => save({ hideEmptyGroups: !hide })}>
        <ListItemIcon>{hide ? <Check fontSize="small" aria-hidden="true" /> : null}</ListItemIcon>
        <ListItemText>{th.database.kanban.hideEmpty}</ListItemText>
      </MenuItem>
      <CardPropertyItems view={view} />
    </>
  )
}
