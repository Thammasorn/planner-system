'use client'
// src/components/database/calendar/CalendarView.tsx — the calendar view of a database (SPEC §4.14 FR-1440…1445,
// §8.11; BR-97; M11-D25/D31/D39). A Monday-first month of the view's DATE column (domain calendarMonth): heading
// "พฤศจิกายน 2569", ‹ วันนี้ ›, today framed (--today) with the text "วันนี้", Sat/Sun shaded (--nonworking), ≤ 3 cards a
// day then "+N เพิ่มเติม" (the whole day in a popover), a hover "+" that creates a row on that day, and the collapsible
// "ไม่มีวันที่ (N)" list beside (below in a narrow block). Cards move by dnd-kit (pointer or keyboard) onto a day / the
// list, or by the card's ⋯ "ย้ายไปวันที่…" (date picker) / "เอาวันที่ออก" — the only way on phones, where the month is a
// day list. Database data only: no leave, holidays or milestones (FR-1445, BR-98). Viewer state: the shown month.
// v3.7 (BR-97, owner 2026-11-03): a cell holding a range is a multi-day bar laid out by the plan calendar's lane helper
// (src/lib/plan-calendar monthBars, ≤ 3 lanes per week, the rest in "+N"); dragging the bar moves the whole range
// (length kept), dragging its start/end edge resizes it, and Alt+←/→ (move) / Alt+Shift+←/→ (end) do it by keyboard.
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
import {
  type CSSProperties,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { dayjsToIso, isoToDayjs } from '@/components/common/DateField'
import {
  calendarMonth,
  dateSpanOf,
  liveConfig,
  resizeDateRange,
  rowValue,
  shiftDateRange,
  valuesFromFilters,
} from '@/domain/database'
import { diffDays, isoWeekday } from '@/domain/dates'
import type { DateRangeValue, ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import type { CellValue, DbColumnDTO, DbRowDTO, DbViewDTO } from '@/lib/contracts/databases'
import { formatThaiDate, formatThaiDateSpan, formatThaiMonthYear } from '@/lib/format'
import { CALENDAR_MAX_LANES, monthBars, type BarSegment } from '@/lib/plan-calendar/bars'
import { useDbApi } from '../data/contract'
import { useRowMenu } from '../menus/RowMenu'
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

/** A range cell value (v3.7), else null. */
const rangeOf = (v: CellValue | null): DateRangeValue | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? v : null

/**
 * BR-97 (v3.7): the range a bar gesture produces — `move` shifts the whole range by the days between the grabbed
 * day and the day under the pointer (length kept); `start` / `end` move that edge to the day (never past the other).
 */
export function dragRange(
  mode: 'move' | 'start' | 'end',
  orig: DateRangeValue,
  grab: ISODate,
  over: ISODate,
): DateRangeValue {
  return mode === 'move' ? shiftDateRange(orig, diffDays(grab, over)) : resizeDateRange(orig, mode, over)
}

/** BR-97 (v3.7) keyboard on a focused bar: Alt+←/→ move the range a day, Alt+Shift+←/→ move its end; else null. */
export function rangeKey(
  e: Pick<KeyboardEvent, 'key' | 'altKey' | 'shiftKey' | 'metaKey' | 'ctrlKey'>,
  r: DateRangeValue,
): DateRangeValue | null {
  if (!e.altKey || e.metaKey || e.ctrlKey) return null
  const by = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
  if (by === 0) return null
  if (!e.shiftKey) return shiftDateRange(r, by)
  const next = resizeDateRange(r, 'end', shiftDateRange(r, by).end)
  return next.end === r.end ? null : next
}

/** The day cell under a viewport point, skipping range bars (they overlay the days). */
function dayAt(x: number, y: number, root: HTMLElement | null): ISODate | null {
  if (!root || typeof document.elementsFromPoint !== 'function') return null
  for (const el of document.elementsFromPoint(x, y)) {
    if (!root.contains(el) || el.closest('[data-range-bar]')) continue
    const cell = el.closest<HTMLElement>('[role="gridcell"][data-date]')
    if (cell) return cell.dataset.date ?? null
  }
  return null
}

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
  /** A bar being dragged: its live range (the layout follows it) until the pointer is released. */
  const [preview, setPreview] = useState<{ rowId: string; range: DateRangeValue } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const refocus = useRef<string | null>(null)
  const weeks = useMemo(() => {
    const ranges = cal.ranges.map((x) =>
      preview && x.row.id === preview.rowId ? { ...x, ...preview.range } : x,
    )
    const ym = `${String(month.year).padStart(4, '0')}-${String(month.month).padStart(2, '0')}`
    const bars = monthBars(
      ranges.map((x) => ({
        id: x.row.id,
        parentId: null,
        position: x.row.position,
        startDate: x.start,
        dueDate: x.end,
        completedOn: null,
      })),
      ym,
      { showCompleted: true, order: ranges.map((x) => x.row.id) },
    )
    return new Map(bars.map((w) => [w.week, w]))
  }, [cal.ranges, preview, month])
  useEffect(() => {
    // keyboard moves re-render the bar in another day cell: keep the focus on it
    const id = refocus.current
    if (!id) return
    refocus.current = null
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-range-bar][data-row-id="${id}"] [data-bar-main]`)
      ?.focus()
  })

  if (!col) return <DateColumnPrompt view={view} />

  const t = th.database.calendar
  const title = formatThaiMonthYear(firstOf(month))
  const canDrag = api.canEdit && !narrow
  const rowById = new Map(rows.map((r) => [r.id, r]))
  /** The start of the row's date (a single date = itself). */
  const dateOf = (r: DbRowDTO) => dateSpanOf(rowValue(r, col))?.start ?? null
  const writeDate = (rowId: string, value: ISODate | DateRangeValue | null) =>
    api.updateRow(rowId, { cells: { [col.id]: value } }, undefined, { toast: th.database.toasts.moved })
  /** Moves a row to start on `value` (a range keeps its length, v3.7) or clears its date (null). */
  const setDate = (rowId: string, value: ISODate | null) => {
    const r = rowById.get(rowId)
    const range = r ? rangeOf(rowValue(r, col)) : null
    writeDate(rowId, value !== null && range ? shiftDateRange(range, diffDays(range.start, value)) : value)
  }
  const rangeById = new Map(cal.ranges.map((x) => [x.row.id, x]))
  const barProps: BarProps = {
    canEdit: api.canEdit,
    canDrag,
    onOpen: openRow,
    gridRef,
    rangeOf: (id) => {
      const x = rangeById.get(id)
      return x ? { start: x.start, end: x.end } : null
    },
    rowOf: (id) => rowById.get(id),
    onPreview: (rowId, range) => setPreview(range ? { rowId, range } : null),
    onCommit: (rowId, range, keyboard) => {
      if (keyboard) refocus.current = rowId
      writeDate(rowId, range)
    },
  }
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
    const days = cal.weeks
      .flat()
      .filter((d) => d.inMonth && (d.rows.length + d.rangeRows.length > 0 || d.date === api.today))
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
              {[...d.rangeRows, ...d.rows].map((r) => (
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
          <div ref={gridRef} className={s.grid} role="grid" aria-label={t.gridLabel(title)}>
            <div role="row" className={s.weekdays}>
              {t.weekdays.map((w, i) => (
                <span key={w} role="columnheader" className={s.weekday} title={t.weekdaysLong[i]}>
                  {w}
                </span>
              ))}
            </div>
            {cal.weeks.map((week) => {
              const wb = weeks.get(week[0]!.date)
              const segs = wb?.segments ?? []
              const lanes = segs.reduce((n, x) => Math.max(n, x.lane + 1), 0)
              return (
                <div
                  key={week[0]!.date}
                  role="row"
                  className={s.week}
                  style={{ '--lanes': Math.min(lanes, CALENDAR_MAX_LANES) } as CSSProperties}
                >
                  {week.map((d, i) => (
                    <DayCell
                      key={d.date}
                      date={d.date}
                      rows={d.rows}
                      rangeRows={d.rangeRows}
                      bars={segs.filter((x) => x.startCol === i)}
                      overflow={wb?.overflow.get(d.date)?.length ?? 0}
                      lanes={Math.min(lanes, CALENDAR_MAX_LANES)}
                      inMonth={d.inMonth}
                      today={d.date === api.today}
                      canEdit={api.canEdit}
                      canDrag={canDrag}
                      cardProps={cardProps}
                      barProps={barProps}
                      onCreate={create}
                    />
                  ))}
                </div>
              )
            })}
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
  /** v3.7: rows whose range covers this day (bars; listed in the "+N" popover). */
  rangeRows: DbRowDTO[]
  /** Bar segments that start in this cell. */
  bars: BarSegment[]
  /** Ranges covering this day that did not fit the week's lanes. */
  overflow: number
  /** Bar lanes used in this week row (≤ 3): the space kept above the cards. */
  lanes: number
  barProps: BarProps
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
  const hidden = p.rows.length - shown.length + p.overflow
  const dayNumber = Number(p.date.slice(8, 10))
  const total = p.rows.length + p.rangeRows.length
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      className={s.day}
      aria-label={t.dayLabel(longDate(p.date), total)}
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
      {p.bars.length > 0 || p.lanes > 0 ? <div className={s.laneSpace} aria-hidden="true" /> : null}
      {p.bars.map((b) => (
        <RangeBar key={b.taskId} seg={b} {...p.barProps} />
      ))}
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
          {[...p.rangeRows, ...p.rows].map((r) => (
            <CalendarCard key={r.id} row={r} {...p.cardProps} canDrag={false} />
          ))}
        </div>
      </Popover>
    </div>
  )
}

interface BarProps {
  canEdit: boolean
  canDrag: boolean
  onOpen: (rowId: string) => void
  gridRef: { current: HTMLDivElement | null }
  rangeOf: (rowId: string) => DateRangeValue | null
  rowOf: (rowId: string) => DbRowDTO | undefined
  onPreview: (rowId: string, range: DateRangeValue | null) => void
  onCommit: (rowId: string, range: DateRangeValue, keyboard: boolean) => void
}

/** Pixels the pointer must travel before a press on a bar becomes a drag (a shorter press is a click). */
const DRAG_SLOP = 4

/**
 * One week-row segment of a range bar (BR-97 v3.7): the row title over the covered days, ◂/▸ cut ends when it goes on
 * in the previous/next row. Press-and-drag the bar = move the whole range; drag an edge handle = resize; click =
 * open the row; Alt+←/→ / Alt+Shift+←/→ on the focused bar = move / change the end; right-click / Shift+F10 = row menu.
 */
function RangeBar(p: BarProps & { seg: BarSegment }): JSX.Element | null {
  const t = th.database.calendar
  const rowMenu = useRowMenu({ openRow: p.onOpen })
  const suppressClick = useRef(false)
  const row = p.rowOf(p.seg.taskId)
  const range = p.rangeOf(p.seg.taskId)
  if (!row || !range) return null
  const title = row.title || th.database.table.untitledRow
  const span = formatThaiDateSpan(range.start, range.end)

  const begin = (mode: 'move' | 'start' | 'end') => (e: ReactPointerEvent<HTMLElement>) => {
    if (!p.canDrag || e.button !== 0) return
    e.stopPropagation()
    if (mode !== 'move') e.preventDefault()
    const grab = dayAt(e.clientX, e.clientY, p.gridRef.current) ?? range.start
    const x0 = e.clientX
    const y0 = e.clientY
    let moved = false
    let last: DateRangeValue = range
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_SLOP) return
      moved = true
      const over = dayAt(ev.clientX, ev.clientY, p.gridRef.current)
      if (!over) return
      const next = dragRange(mode, range, grab, over)
      if (next.start !== last.start || next.end !== last.end) {
        last = next
        p.onPreview(row.id, next)
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      p.onPreview(row.id, null)
      if (!moved) return
      suppressClick.current = true
      if (last.start !== range.start || last.end !== range.end) p.onCommit(row.id, last, false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (p.canEdit) {
      const next = rangeKey(e, range)
      if (next) {
        e.preventDefault()
        e.stopPropagation()
        p.onCommit(row.id, next, true)
        return
      }
    }
    void rowMenu.onKeyDown(e, row.id)
  }

  return (
    <div
      className={s.bar}
      style={{ '--lane': p.seg.lane, '--span': p.seg.endCol - p.seg.startCol + 1 } as CSSProperties}
      data-range-bar=""
      data-testid="db-range-bar"
      data-row-id={row.id}
      data-start={range.start}
      data-end={range.end}
      data-cut-left={p.seg.continuesLeft || undefined}
      data-cut-right={p.seg.continuesRight || undefined}
      onContextMenu={(e) => rowMenu.onContextMenu(e, row.id)}
    >
      {p.canDrag && !p.seg.continuesLeft ? (
        <span
          className={s.barEdge}
          data-edge="start"
          role="presentation"
          title={t.resizeStart(title)}
          onPointerDown={begin('start')}
        />
      ) : null}
      <button
        type="button"
        className={s.barMain}
        data-bar-main=""
        aria-label={t.openBar(title, span)}
        aria-keyshortcuts={
          p.canEdit ? 'Alt+ArrowLeft Alt+ArrowRight Alt+Shift+ArrowLeft Alt+Shift+ArrowRight' : undefined
        }
        title={p.canEdit ? `${span} · ${t.barKeysHint}` : span}
        onPointerDown={begin('move')}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          p.onOpen(row.id)
        }}
        onKeyDown={onKeyDown}
      >
        {p.seg.continuesLeft ? <span aria-hidden="true">◂</span> : null}
        <span className={s.barText}>{title}</span>
        {p.seg.continuesRight ? <span aria-hidden="true">▸</span> : null}
      </button>
      {p.canDrag && !p.seg.continuesRight ? (
        <span
          className={s.barEdge}
          data-edge="end"
          role="presentation"
          title={t.resizeEnd(title)}
          onPointerDown={begin('end')}
        />
      ) : null}
      {rowMenu.menu}
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
  // FR-1424a: right-click / Shift+F10 opens the row menu instead of the browser's
  const rowMenu = useRowMenu({ openRow: p.onOpen })
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
      onContextMenu={(e) => rowMenu.onContextMenu(e, row.id)}
    >
      <button
        type="button"
        className={s.cardMain}
        aria-label={t.openCard(title)}
        onClick={() => p.onOpen(row.id)}
        onKeyDown={(e) => void rowMenu.onKeyDown(e, row.id)}
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
      {rowMenu.menu}
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
