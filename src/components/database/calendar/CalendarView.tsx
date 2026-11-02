'use client'
// src/components/database/calendar/CalendarView.tsx — the calendar view of a database (SPEC §4.14 FR-1440…1445,
// §8.11; BR-97; M11-D25/D31/D39). A Monday-first month of the view's DATE column (domain calendarMonth): heading
// "พฤศจิกายน 2569", ‹ วันนี้ ›, today framed (--today) with the text "วันนี้", Sat/Sun shaded (--nonworking), ≤ 3 cards a
// day then "+N เพิ่มเติม" (the whole day in a popover), a hover "+" that creates a row on that day, and the collapsible
// "ไม่มีวันที่ (N)" list beside (below in a narrow block). Cards move by dnd-kit (pointer or keyboard) onto a day / the
// list, or by the card's ⋯ "ย้ายไปวันที่…" (date picker) / "เอาวันที่ออก" — the only way on phones, where the month is a
// day list. Database data only: no leave, holidays or milestones (FR-1445, BR-98). Viewer state: the shown month.
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type UniqueIdentifier,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import Add from '@mui/icons-material/Add'
import Check from '@mui/icons-material/Check'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import DragIndicator from '@mui/icons-material/DragIndicator'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import MoreHoriz from '@mui/icons-material/MoreHoriz'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import { type JSX, type PointerEventHandler, useMemo, useState } from 'react'
import { dayjsToIso, isoToDayjs } from '@/components/common/DateField'
import { calendarMonth, liveConfig, rowValue, valuesFromFilters } from '@/domain/database'
import { isoWeekday } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { CellValue, DbColumnDTO, DbRowDTO, DbViewDTO } from '@/lib/contracts/databases'
import { formatThaiDate, formatThaiMonthYear } from '@/lib/format'
import { useDbApi } from '../data/contract'
import { dndAccessibility, useDbSensors } from '../dnd'
import { CardContent, CardPropertyItems, useDbCtx } from '../kanban/card'
import type { DatabaseViewMenuProps, DatabaseViewProps } from '../view-registry'
import s from './calendar.module.css'

const MAX_PER_DAY = 3
const NO_DATE = 'n'

// ── pure helpers (exported for tests) ────────────────────────────────────────────────────────────────────────────

/** The date value a drop on `overId` writes (`d|<date>` = that day, `n` = the no-date list → null); null = nothing. */
export function dropValue(
  overId: UniqueIdentifier,
  current: ISODate | null,
): { value: ISODate | null } | null {
  const id = String(overId)
  if (id === NO_DATE) return current === null ? null : { value: null }
  if (!id.startsWith('d|')) return null
  const date = id.slice(2)
  return date === current ? null : { value: date }
}

const monthOf = (d: ISODate) => ({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) })
const firstOf = (m: { year: number; month: number }): ISODate =>
  `${String(m.year).padStart(4, '0')}-${String(m.month).padStart(2, '0')}-01`
const shift = (m: { year: number; month: number }, by: number) => {
  const i = m.year * 12 + (m.month - 1) + by
  return { year: Math.floor(i / 12), month: (i % 12) + 1 }
}
const longDate = (d: ISODate) =>
  `${th.database.calendar.weekdaysLong[isoWeekday(d) - 1]} ${formatThaiDate(d, 'long')}`

/** Pointer: the day under the pointer; keyboard: the day the card overlaps most. */
const collision: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)

// ── view ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export function CalendarView({ view, rows, openRow, narrow }: DatabaseViewProps): JSX.Element {
  const api = useDbApi()
  const ctx = useDbCtx()
  const live = useMemo(() => liveConfig(view.config, api.db.columns), [view.config, api.db.columns])
  const col = api.db.columns.find((c) => c.id === live.dateColumnId && c.type === 'DATE')
  const [month, setMonth] = useState(() => monthOf(api.today))
  const cal = useMemo(
    () => calendarMonth(month, rows, col?.id, live.sorts ?? [], api.db.columns, ctx),
    [month, rows, col?.id, live.sorts, api.db.columns, ctx],
  )
  const sensors = useDbSensors()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showNoDate, setShowNoDate] = useState(true)

  if (!col) return <DateColumnPrompt view={view} />

  const t = th.database.calendar
  const title = formatThaiMonthYear(firstOf(month))
  const canDrag = api.canEdit && !narrow
  const rowById = new Map(rows.map((r) => [r.id, r]))
  const dateOf = (r: DbRowDTO) => rowValue(r, col) as ISODate | null
  const setDate = (rowId: string, value: ISODate | null) =>
    api.updateRow(rowId, { cells: { [col.id]: value } }, undefined, { toast: th.database.toasts.moved })
  const create = (date: ISODate, title: string) => {
    const inherited = valuesFromFilters(live.filters ?? [], api.db.columns, ctx)
    const cells: Record<string, CellValue> = { ...inherited.cells, [col.id]: date }
    void api.createRows([{ title, cells }])
  }
  const nameOf = (id: UniqueIdentifier) => {
    const sid = String(id)
    if (sid.startsWith('c|')) return rowById.get(sid.slice(2))?.title || th.database.table.untitledRow
    if (sid.startsWith('d|')) return formatThaiDate(sid.slice(2), 'long')
    return t.noDate(cal.noDate.length)
  }
  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id)
    setActiveId(id.startsWith('c|') ? id.slice(2) : null)
  }
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const id = String(e.active.id)
    const r = id.startsWith('c|') ? rowById.get(id.slice(2)) : undefined
    if (!r || !e.over) return
    const v = dropValue(e.over.id, dateOf(r))
    if (v) setDate(r.id, v.value)
  }
  const activeRow = activeId ? rowById.get(activeId) : undefined
  const cardProps = { view, canEdit: api.canEdit, canDrag, onOpen: openRow, onSetDate: setDate, dateOf }

  const header = (
    <div className={s.header}>
      <h3 className={s.title}>{title}</h3>
      <div className={s.nav}>
        <IconButton size="small" aria-label={t.prev} onClick={() => setMonth((m) => shift(m, -1))}>
          <ChevronLeft fontSize="small" />
        </IconButton>
        <Button size="small" color="inherit" onClick={() => setMonth(monthOf(api.today))}>
          {t.today}
        </Button>
        <IconButton size="small" aria-label={t.next} onClick={() => setMonth((m) => shift(m, 1))}>
          <ChevronRight fontSize="small" />
        </IconButton>
      </div>
    </div>
  )

  const noDate = (
    <NoDateList
      rows={cal.noDate}
      open={showNoDate}
      onToggle={() => setShowNoDate((v) => !v)}
      canDrag={canDrag}
      cardProps={cardProps}
    />
  )

  if (narrow) {
    const days = cal.weeks.flat().filter((d) => d.inMonth && (d.rows.length > 0 || d.date === api.today))
    return (
      <div className={s.calendar} data-testid="db-calendar" data-narrow="true">
        {header}
        <ul className={s.dayList} data-testid="db-calendar-days" aria-label={t.gridLabel(title)}>
          {days.map((d) => (
            <li key={d.date} className={s.dayListItem} aria-label={longDate(d.date)} data-date={d.date}>
              <div className={s.dayListHead} data-today={d.date === api.today || undefined}>
                <span>{longDate(d.date)}</span>
                {d.date === api.today ? <span className={s.todayBadge}>{t.today}</span> : null}
              </div>
              {d.rows.map((r) => (
                <CalendarCard key={r.id} row={r} {...cardProps} canDrag={false} />
              ))}
            </li>
          ))}
          {days.length === 0 ? <li className={s.muted}>{t.monthEmpty}</li> : null}
        </ul>
        {noDate}
      </div>
    )
  }

  return (
    <div className={s.calendar} data-testid="db-calendar">
      {header}
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        accessibility={dndAccessibility(nameOf)}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className={s.body}>
          <div className={s.grid} role="grid" aria-label={t.gridLabel(title)}>
            <div role="row" className={s.weekdays}>
              {t.weekdays.map((w, i) => (
                <span key={w} role="columnheader" className={s.weekday} title={t.weekdaysLong[i]}>
                  {w}
                </span>
              ))}
            </div>
            {cal.weeks.map((week) => (
              <div key={week[0]!.date} role="row" className={s.week}>
                {week.map((d) => (
                  <DayCell
                    key={d.date}
                    date={d.date}
                    rows={d.rows}
                    inMonth={d.inMonth}
                    today={d.date === api.today}
                    canEdit={api.canEdit}
                    canDrag={canDrag}
                    cardProps={cardProps}
                    onCreate={create}
                  />
                ))}
              </div>
            ))}
          </div>
          {noDate}
        </div>
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

interface CardProps {
  view: DbViewDTO
  canEdit: boolean
  canDrag: boolean
  onOpen: (rowId: string) => void
  onSetDate: (rowId: string, value: ISODate | null) => void
  dateOf: (r: DbRowDTO) => ISODate | null
}

function DayCell(p: {
  date: ISODate
  rows: DbRowDTO[]
  inMonth: boolean
  today: boolean
  canEdit: boolean
  canDrag: boolean
  cardProps: CardProps
  onCreate: (date: ISODate, title: string) => void
}): JSX.Element {
  const t = th.database.calendar
  const { setNodeRef, isOver } = useDroppable({ id: `d|${p.date}`, disabled: !p.canDrag })
  const [adding, setAdding] = useState(false)
  const [more, setMore] = useState<HTMLElement | null>(null)
  const weekend = isoWeekday(p.date) >= 6
  const shown = p.rows.slice(0, MAX_PER_DAY)
  const hidden = p.rows.length - shown.length
  const dayNumber = Number(p.date.slice(8, 10))
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      className={s.day}
      aria-label={t.dayLabel(longDate(p.date), p.rows.length)}
      data-date={p.date}
      data-today={p.today || undefined}
      data-weekend={weekend || undefined}
      data-outside={!p.inMonth || undefined}
      data-over={isOver || undefined}
    >
      <div className={s.dayHead}>
        <span className={s.dayNumber}>{dayNumber}</span>
        {p.today ? <span className={s.todayBadge}>{t.today}</span> : null}
        {p.canEdit && !adding ? (
          <button
            type="button"
            className={s.addDay}
            aria-label={t.addOnDay(formatThaiDate(p.date))}
            title={t.addOnDay(formatThaiDate(p.date))}
            onClick={() => setAdding(true)}
          >
            <Add fontSize="inherit" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {shown.map((r) => (
        <CalendarCard key={r.id} row={r} {...p.cardProps} />
      ))}
      {hidden > 0 ? (
        <button type="button" className={s.more} onClick={(e) => setMore(e.currentTarget)}>
          {t.more(hidden)}
        </button>
      ) : null}
      {adding ? (
        <DayInput
          label={t.addOnDay(formatThaiDate(p.date))}
          onSubmit={(title) => p.onCreate(p.date, title)}
          onClose={() => setAdding(false)}
        />
      ) : null}
      <Popover
        open={more !== null}
        anchorEl={more}
        onClose={() => setMore(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { role: 'dialog', 'aria-label': longDate(p.date) } }}
      >
        <div className={s.popover}>
          <div className={s.popoverTitle}>{longDate(p.date)}</div>
          {p.rows.map((r) => (
            <CalendarCard key={r.id} row={r} {...p.cardProps} canDrag={false} />
          ))}
        </div>
      </Popover>
    </div>
  )
}

/** "+" on a day: a name input; Enter creates the row on that day and closes; Esc / empty blur closes (FR-1443). */
function DayInput(p: { label: string; onSubmit: (title: string) => void; onClose: () => void }): JSX.Element {
  const [value, setValue] = useState('')
  const submit = () => {
    const t = value.trim()
    if (t !== '') p.onSubmit(t)
    p.onClose()
  }
  return (
    <input
      className={s.dayInput}
      autoFocus
      value={value}
      aria-label={p.label}
      placeholder={th.database.calendar.addPlaceholder}
      maxLength={500}
      onChange={(e) => setValue(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.code === 'Enter' || e.key === 'Enter') {
          e.preventDefault()
          submit()
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

function NoDateList(p: {
  rows: DbRowDTO[]
  open: boolean
  onToggle: () => void
  canDrag: boolean
  cardProps: CardProps
}): JSX.Element {
  const t = th.database.calendar
  const { setNodeRef, isOver } = useDroppable({ id: NO_DATE, disabled: !p.canDrag })
  return (
    <aside
      ref={setNodeRef}
      className={s.noDate}
      data-testid="db-calendar-nodate"
      data-over={isOver || undefined}
    >
      <button type="button" className={s.noDateToggle} aria-expanded={p.open} onClick={p.onToggle}>
        {p.open ? (
          <ExpandLess fontSize="small" aria-hidden="true" />
        ) : (
          <ExpandMore fontSize="small" aria-hidden="true" />
        )}
        <span>{t.noDate(p.rows.length)}</span>
      </button>
      {p.open ? (
        <div className={s.noDateList}>
          {p.rows.map((r) => (
            <CalendarCard key={r.id} row={r} {...p.cardProps} />
          ))}
          {p.rows.length === 0 ? (
            <span className={s.muted}>{p.canDrag ? t.noDateDrop : t.noDateEmpty}</span>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}

function CalendarCard(p: CardProps & { row: DbRowDTO }): JSX.Element {
  const t = th.database.calendar
  const { row } = p
  const title = row.title || th.database.table.untitledRow
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `c|${row.id}`,
    disabled: !p.canDrag,
  })
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [picker, setPicker] = useState<HTMLElement | null>(null)
  const current = p.dateOf(row)
  return (
    <div
      ref={p.canDrag ? setNodeRef : undefined}
      className={s.card}
      data-testid="db-card"
      data-row-id={row.id}
      data-dragging={isDragging || undefined}
      onPointerDown={p.canDrag ? (listeners?.onPointerDown as PointerEventHandler | undefined) : undefined}
    >
      <button
        type="button"
        className={s.cardMain}
        aria-label={t.openCard(title)}
        onClick={() => p.onOpen(row.id)}
      >
        <CardContent row={row} view={p.view} />
      </button>
      {p.canEdit ? (
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
            aria-label={t.cardMenu(title)}
            aria-haspopup="menu"
            aria-expanded={menu !== null}
            onClick={(e) => setMenu(e.currentTarget)}
          >
            <MoreHoriz fontSize="inherit" aria-hidden="true" />
          </button>
          <Menu anchorEl={menu} open={menu !== null} onClose={() => setMenu(null)}>
            <MenuItem
              onClick={() => {
                setPicker(menu)
                setMenu(null)
              }}
            >
              <ListItemText>{t.moveTo}</ListItemText>
            </MenuItem>
            {current !== null ? (
              <MenuItem
                onClick={() => {
                  setMenu(null)
                  p.onSetDate(row.id, null)
                }}
              >
                <ListItemText>{t.clearDate}</ListItemText>
              </MenuItem>
            ) : null}
          </Menu>
          <Popover
            open={picker !== null}
            anchorEl={picker}
            onClose={() => setPicker(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            slotProps={{ paper: { role: 'dialog', 'aria-label': t.moveTo } }}
          >
            <DateCalendar
              value={isoToDayjs(current)}
              onChange={(d) => {
                const iso = dayjsToIso(d)
                setPicker(null)
                if (iso && iso !== current) p.onSetDate(row.id, iso)
              }}
            />
          </Popover>
        </div>
      ) : null}
    </div>
  )
}

/** No (live) DATE column for the view (FR-1415 deleted / never chosen): pick one, or create "วันที่" when none exists. */
function DateColumnPrompt({ view }: { view: DbViewDTO }): JSX.Element {
  const api = useDbApi()
  const candidates = api.db.columns.filter((c) => c.type === 'DATE')
  const use = (id: string) => api.updateView(view.id, { config: { ...view.config, dateColumnId: id } })
  return (
    <div className={s.prompt} data-testid="db-calendar-pick">
      <span>{th.database.calendar.pickDateColumn}</span>
      {api.canEdit ? (
        <div className={s.promptActions}>
          {candidates.map((c: DbColumnDTO) => (
            <Button key={c.id} size="small" variant="outlined" onClick={() => use(c.id)}>
              {c.name}
            </Button>
          ))}
          {candidates.length === 0 ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() =>
                void api.createColumn('DATE', { name: th.database.defaults.date }).then((id) => use(id))
              }
            >
              {th.database.calendar.createDateColumn}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** The calendar part of the view ⋯ menu: คอลัมน์วันที่ (radio over DATE columns), คุณสมบัติบนการ์ด. */
export function CalendarMenuItems({ view }: DatabaseViewMenuProps): JSX.Element {
  const api = useDbApi()
  const dates = api.db.columns.filter((c) => c.type === 'DATE')
  return (
    <>
      <ListSubheader className={s.menuHeading}>{th.database.calendar.pickDateColumn}</ListSubheader>
      {dates.map((c) => {
        const on = view.config.dateColumnId === c.id
        return (
          <MenuItem
            key={c.id}
            role="menuitemradio"
            aria-checked={on}
            onClick={() => api.updateView(view.id, { config: { ...view.config, dateColumnId: c.id } })}
          >
            <ListItemIcon>{on ? <Check fontSize="small" aria-hidden="true" /> : null}</ListItemIcon>
            <ListItemText>{c.name}</ListItemText>
          </MenuItem>
        )
      })}
      <CardPropertyItems view={view} />
    </>
  )
}
