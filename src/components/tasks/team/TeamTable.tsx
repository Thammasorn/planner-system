'use client'
// src/components/tasks/team/TeamTable.tsx — /tasks ตาราง (M11.4, FR-668): the filtered team tasks as an AFFiNE/Notion
// database-style table on REAL tasks (M11's table look, not its data model). Columns ชื่องาน · โปรเจค · สถานะ ·
// ผู้รับผิดชอบ · วันเริ่ม · ครบกำหนด · milestone · ตัวขวาง · ภาระรวม; header click sorts (asc → desc → none); show/hide,
// widths and "จัดกลุ่มตามโปรเจค" persist in `tasks.table` (user_preferences). Keyboard grid (ARIA grid, roving cell):
// arrows / Home / End / PageUp / PageDown move, Enter edits the cell (or opens the panel on read-only cells), Esc leaves
// an editor back to its cell, Shift+Space opens the task page, Shift+F10 / ContextMenu opens the row menu. A row click
// opens the task panel (`?task=`); ↗ is a real link. Edits use the existing actions (status: useSetTaskStatus;
// assignees: M3's AssigneePicker + useTaskMutations; dates / milestone / delete: useTeamTaskEdits) — edits are gated as
// in the task panel (/tasks only lists active projects the viewer can see; archived projects are not listed).
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import NorthEastOutlined from '@mui/icons-material/NorthEastOutlined'
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined'
import ViewColumnOutlined from '@mui/icons-material/ViewColumnOutlined'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import { useVirtualizer } from '@tanstack/react-virtual'
import { dayjsToIso, isoToDayjs } from '@/components/common/DateField'
import { compareISO } from '@/domain/dates'
import { formatCd } from '@/domain/units'
import type { ISODate } from '@/domain/types'
import { usePreferences } from '@/hooks/usePreferences'
import { useToday } from '@/hooks/useToday'
import { th } from '@/i18n/th'
import type { PersonOption } from '@/lib/contracts/people'
import type { TaskStatusDTO, TeamMilestoneRef, TeamTaskCard } from '@/lib/contracts/tasks'
import { displayName } from '@/lib/display-name'
import { formatThaiDate } from '@/lib/format'
import { HOTKEYS, matchesHotkey, type Hotkey } from '@/lib/keys'
import { taskPageHref } from '@/lib/nav/task-href'
import { TEAM_TABLE_PREF_DEFAULT, type TeamTableColumn } from '@/lib/schemas/preferences'
import {
  nextSort,
  setColumnWidth,
  sortCards,
  tableItems,
  toggleColumn,
  visibleColumns,
  type TableColumn,
  type TableSort,
} from '@/lib/tasks/team-table'
import { buildTaskRows } from '@/lib/tasks/tree'
import { milestoneColorVar } from '@/lib/theme/tokens'
import { AssigneeChips, personOf } from '../AssigneeChips'
import { AssigneePicker } from '../AssigneePicker'
import { BlockerBadge } from '../blockers/BlockerBadge'
import { HasBodyMark, OpenAsPageLink } from '../OpenAsPage'
import { StatusChip } from '../status/StatusChip'
import { StatusMenu } from '../status/StatusMenu'
import { useProjectTasks } from '../useProjectTasks'
import { useTaskMutations } from '../useTaskMutations'
import type { TeamTaskEdits } from './useTeamTaskEdits'
import styles from './TeamTable.module.css'

const ROW_H = 36
/** Above this many rows the body is virtualised (M11-D22's threshold). */
const VIRTUAL_FROM = 60
const RESIZE_STEP = 16
const EDITABLE: ReadonlySet<TeamTableColumn> = new Set(['status', 'assignees', 'startDate', 'dueDate', 'milestone'])
const OPEN_KEYS: readonly Hotkey[] = [{ code: 'Enter', key: 'Enter' }, { code: 'NumpadEnter' }]
const MENU_KEYS: readonly Hotkey[] = [{ code: 'F10', key: 'F10', shift: true }, { code: 'ContextMenu', key: 'ContextMenu' }]
const CLEAR_KEYS: readonly Hotkey[] = [
  { code: 'Delete', key: 'Delete' },
  { code: 'Backspace', key: 'Backspace' },
]

type ProjectRef = { id: string; name: string; color: string }
type Pos = { row: number; col: number }
type Editing = { cardId: string; column: TeamTableColumn; anchor: HTMLElement }
type RowMenu = { card: TeamTaskCard; anchor: { top: number; left: number } }

export interface TeamTableProps {
  cards: readonly TeamTaskCard[]
  projectOf: (projectId: string) => ProjectRef
  statusesByProject: Readonly<Record<string, TaskStatusDTO[]>>
  milestonesByProject: Readonly<Record<string, TeamMilestoneRef[]>>
  people: ReadonlyMap<string, PersonOption>
  /** the task panel (`?task=`) */
  onOpen: (card: TeamTaskCard) => void
  onPickStatus: (card: TeamTaskCard, statusId: string) => void
  edits: TeamTaskEdits
}

export function TeamTable(p: TeamTableProps) {
  const router = useRouter()
  const today = useToday()
  const { prefs, setPreference } = usePreferences()
  const pref = prefs['tasks.table'] ?? TEAM_TABLE_PREF_DEFAULT
  const [resizing, setResizing] = useState<{ column: TeamTableColumn; width: number } | null>(null)
  const columns = useMemo<TableColumn[]>(
    () =>
      visibleColumns(pref).map((c) => (resizing?.column === c.id ? { ...c, width: resizing.width } : c)),
    [pref, resizing],
  )
  const totalWidth = columns.reduce((s, c) => s + c.width, 0)
  const [sort, setSort] = useState<TableSort | null>(null)
  const [columnsAnchor, setColumnsAnchor] = useState<HTMLElement | null>(null)

  const milestoneOf = useCallback(
    (c: TeamTaskCard): TeamMilestoneRef | null =>
      (c.milestoneId ? p.milestonesByProject[c.projectId]?.find((m) => m.id === c.milestoneId) : undefined) ?? null,
    [p.milestonesByProject],
  )
  const projectName = useCallback((id: string) => p.projectOf(id).name, [p])
  const sorted = useMemo(
    () =>
      sortCards(p.cards, sort, {
        projectName,
        assigneeName: (c) => (c.assigneeIds[0] ? displayName(personOf(p.people, c.assigneeIds[0])) : ''),
        milestoneOf,
      }),
    [p.cards, p.people, sort, projectName, milestoneOf],
  )
  const items = useMemo(
    () => tableItems(sorted, { groupByProject: pref.groupByProject, projectName }),
    [sorted, pref.groupByProject, projectName],
  )
  const rows = useMemo(() => items.flatMap((i) => (i.kind === 'row' ? [i.card] : [])), [items])

  // ── roving cell focus ──
  const [active, setActiveState] = useState<Pos>({ row: 0, col: 0 })
  const act: Pos = {
    row: Math.min(active.row, Math.max(0, rows.length - 1)),
    col: Math.min(active.col, columns.length - 1),
  }
  const [focusTick, setFocusTick] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const moveTo = (pos: Pos) => {
    setActiveState(pos)
    setFocusTick((n) => n + 1)
  }

  // ── virtualisation ──
  const virtual = items.length > VIRTUAL_FROM
  const rv = useVirtualizer({
    count: virtual ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
    useFlushSync: false,
    getItemKey: (i) => {
      const it = items[i]
      return it ? (it.kind === 'row' ? it.card.id : `g:${it.projectId}`) : i
    },
  })
  const vItems = virtual ? rv.getVirtualItems() : []
  const shown = virtual ? vItems.map((v) => ({ item: items[v.index]!, index: v.index })) : items.map((item, index) => ({ item, index }))
  const padTop = virtual && vItems.length > 0 ? vItems[0]!.start : 0
  const padBottom = virtual && vItems.length > 0 ? rv.getTotalSize() - vItems[vItems.length - 1]!.end : 0
  const itemIndexOfRow = useMemo(() => {
    const out: number[] = []
    items.forEach((it, i) => {
      if (it.kind === 'row') out[it.rowIndex] = i
    })
    return out
  }, [items])

  useLayoutEffect(() => {
    if (focusTick === 0) return
    if (virtual) rv.scrollToIndex(itemIndexOfRow[act.row] ?? 0, { align: 'auto' })
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${act.row}:${act.col}"]`)
    if (el && document.activeElement !== el) el.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per explicit focus request only
  }, [focusTick])

  // ── editors / menus ──
  const [editing, setEditing] = useState<Editing | null>(null)
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null)
  const editingCard = editing ? rows.find((c) => c.id === editing.cardId) : undefined
  const closeEditor = () => {
    setEditing(null)
    setFocusTick((n) => n + 1) // back to the cell (Esc / pick)
  }
  const beginEdit = (card: TeamTaskCard, column: TeamTableColumn, anchor: HTMLElement) => {
    if (!EDITABLE.has(column)) return
    setEditing({ cardId: card.id, column, anchor })
  }
  const openPage = (card: TeamTaskCard) => router.push(taskPageHref(card.id))

  const onCellKeyDown = (e: KeyboardEvent<HTMLDivElement>, pos: Pos, card: TeamTaskCard, column: TeamTableColumn) => {
    if (e.target !== e.currentTarget) return // keys inside an inner control belong to it
    const k = e.nativeEvent
    const go = (row: number, col: number) => {
      e.preventDefault()
      moveTo({ row: Math.max(0, Math.min(rows.length - 1, row)), col: Math.max(0, Math.min(columns.length - 1, col)) })
    }
    if (matchesHotkey(k, { code: 'ArrowDown', key: 'ArrowDown' })) return go(pos.row + 1, pos.col)
    if (matchesHotkey(k, { code: 'ArrowUp', key: 'ArrowUp' })) return go(pos.row - 1, pos.col)
    if (matchesHotkey(k, { code: 'ArrowRight', key: 'ArrowRight' })) return go(pos.row, pos.col + 1)
    if (matchesHotkey(k, { code: 'ArrowLeft', key: 'ArrowLeft' })) return go(pos.row, pos.col - 1)
    if (matchesHotkey(k, { code: 'Home', key: 'Home' })) return go(pos.row, 0)
    if (matchesHotkey(k, { code: 'End', key: 'End' })) return go(pos.row, columns.length - 1)
    if (matchesHotkey(k, { code: 'Home', key: 'Home', mod: true })) return go(0, pos.col)
    if (matchesHotkey(k, { code: 'End', key: 'End', mod: true })) return go(rows.length - 1, pos.col)
    if (matchesHotkey(k, { code: 'PageDown', key: 'PageDown' })) return go(pos.row + 10, pos.col)
    if (matchesHotkey(k, { code: 'PageUp', key: 'PageUp' })) return go(pos.row - 10, pos.col)
    if (matchesHotkey(k, HOTKEYS.openPage)) {
      e.preventDefault()
      openPage(card)
      return
    }
    if (MENU_KEYS.some((hk) => matchesHotkey(k, hk))) {
      e.preventDefault()
      const r = e.currentTarget.getBoundingClientRect()
      setRowMenu({ card, anchor: { top: r.bottom, left: r.left } })
      return
    }
    if (OPEN_KEYS.some((hk) => matchesHotkey(k, hk))) {
      e.preventDefault()
      if (EDITABLE.has(column)) beginEdit(card, column, e.currentTarget)
      else p.onOpen(card)
      return
    }
    if ((column === 'startDate' || column === 'dueDate') && CLEAR_KEYS.some((hk) => matchesHotkey(k, hk))) {
      e.preventDefault()
      if (card[column] !== null) p.edits.setDates(card, { [column]: null })
    }
  }

  const onRowClick = (e: MouseEvent<HTMLDivElement>, card: TeamTaskCard) => {
    // inner controls (chips, buttons, ↗) handle their own clicks
    if ((e.target as HTMLElement).closest('button, a, input, [role="separator"]')) return
    p.onOpen(card)
  }
  const onRowContextMenu = (e: MouseEvent<HTMLDivElement>, card: TeamTaskCard) => {
    e.preventDefault()
    setRowMenu({ card, anchor: { top: e.clientY, left: e.clientX } })
  }

  // ── resize ──
  const startResize = (e: ReactPointerEvent<HTMLDivElement>, column: TableColumn) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    let width = column.width
    const move = (ev: PointerEvent) => {
      width = Math.max(64, Math.min(640, column.width + ev.clientX - startX))
      setResizing({ column: column.id, width })
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      setResizing(null)
      if (width !== column.width) setPreference('tasks.table', setColumnWidth(pref, column.id, width))
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  const onResizeKey = (e: KeyboardEvent<HTMLDivElement>, column: TableColumn) => {
    const k = e.nativeEvent
    const d = matchesHotkey(k, { code: 'ArrowRight', key: 'ArrowRight' })
      ? RESIZE_STEP
      : matchesHotkey(k, { code: 'ArrowLeft', key: 'ArrowLeft' })
        ? -RESIZE_STEP
        : 0
    if (d === 0) return
    e.preventDefault()
    setPreference('tasks.table', setColumnWidth(pref, column.id, column.width + d))
  }

  const colStyle = (c: TableColumn): CSSProperties => ({ width: c.width })

  const renderCell = (card: TeamTaskCard, column: TeamTableColumn): ReactNode => {
    const edit = (e: MouseEvent<HTMLElement>) => {
      e.stopPropagation()
      beginEdit(card, column, e.currentTarget.closest<HTMLElement>('[role="gridcell"]') ?? e.currentTarget)
    }
    switch (column) {
      case 'name':
        return (
          <>
            {card.parentPath.length > 0 ? (
              <span className={styles.parentPath} title={card.parentPath.join(' › ')}>
                {`${card.parentPath.join(' › ')} ›`}
              </span>
            ) : null}
            <span className={styles.nameText} data-done={card.completed ? 'true' : undefined} data-task-name="" title={card.name}>
              {card.name}
            </span>
            {card.hasBody ? <HasBodyMark /> : null}
            <OpenAsPageLink taskId={card.id} tabIndex={-1} alwaysVisible />
          </>
        )
      case 'project': {
        const pr = p.projectOf(card.projectId)
        return (
          <>
            <span aria-hidden="true" className={styles.projectDot} style={{ background: pr.color || undefined }} />
            <span className={styles.ellipsis}>{pr.name}</span>
          </>
        )
      }
      case 'status':
        return <StatusChip status={card.status} tabIndex={-1} onClick={edit} />
      case 'assignees':
        return (
          <button type="button" tabIndex={-1} className={styles.valueButton} onClick={edit} aria-haspopup="dialog">
            {card.assigneeIds.length === 0 ? (
              <span className={styles.muted}>{th.tasks.unassigned}</span>
            ) : (
              <span className={styles.chips}>
                {card.assigneeIds.map((id) => (
                  <span key={id} className={styles.chip}>
                    {displayName(personOf(p.people, id))}
                  </span>
                ))}
              </span>
            )}
          </button>
        )
      case 'startDate':
      case 'dueDate': {
        const v = card[column]
        const overdue =
          column === 'dueDate' && v !== null && !card.completed && compareISO(v, today) < 0
        return (
          <button type="button" tabIndex={-1} className={styles.valueButton} onClick={edit} aria-haspopup="dialog">
            {v === null ? (
              <span className={styles.muted}>{th.teamTasks.table.empty}</span>
            ) : overdue ? (
              <span className={styles.overdue} data-overdue="true">
                <WarningAmberOutlined aria-hidden="true" sx={{ fontSize: 'var(--font-md)' }} />
                {formatThaiDate(v)}
                <span className={styles.muted}>{`(${th.teamTasks.table.overdue})`}</span>
              </span>
            ) : (
              <span>{formatThaiDate(v)}</span>
            )}
          </button>
        )
      }
      case 'milestone': {
        const m = milestoneOf(card)
        return (
          <button type="button" tabIndex={-1} className={styles.valueButton} onClick={edit} aria-haspopup="menu">
            {m ? (
              <>
                <span aria-hidden="true" className={styles.diamond} style={{ color: milestoneColorVar(m.color) }}>
                  {th.milestones.diamond}
                </span>
                <span className={styles.ellipsis}>{m.name}</span>
              </>
            ) : (
              <span className={styles.muted}>{th.teamTasks.table.empty}</span>
            )}
          </button>
        )
      }
      case 'blockers':
        return card.blockers.total > 0 ? (
          <BlockerBadge open={card.blockers.open} total={card.blockers.total} focusable={false} />
        ) : (
          <span className={styles.muted}>{th.teamTasks.table.empty}</span>
        )
      case 'load':
        return card.plannedCd > 0 ? (
          <span title={th.teamTasks.table.loadTitle}>
            {th.teamTasks.table.loadDays(formatCd(card.plannedCd, { unit: 'DAYS', decimals: 1 }))}
          </span>
        ) : (
          <span className={styles.muted}>{th.teamTasks.table.empty}</span>
        )
    }
  }

  /** The accessible text of a cell (the visible value; a date cell says "เลยกำหนด" in words). */
  const cellLabel = (card: TeamTaskCard, column: TeamTableColumn): string | undefined => {
    if (column !== 'dueDate' || card.dueDate === null) return undefined
    const overdue = !card.completed && compareISO(card.dueDate, today) < 0
    return overdue ? th.teamTasks.table.overdueLabel(formatThaiDate(card.dueDate)) : undefined
  }

  return (
    <div className={styles.wrap} data-testid="team-table">
      <div className={styles.toolbar}>
        <Button
          size="small"
          startIcon={<ViewColumnOutlined aria-hidden="true" />}
          aria-haspopup="menu"
          aria-expanded={columnsAnchor !== null}
          onClick={(e) => setColumnsAnchor(e.currentTarget)}
        >
          {th.teamTasks.table.columnsButton}
        </Button>
        <Menu
          anchorEl={columnsAnchor}
          open={columnsAnchor !== null}
          onClose={() => setColumnsAnchor(null)}
          slotProps={{ list: { 'aria-label': th.teamTasks.table.columnsMenu } }}
        >
          {visibleColumns({ ...pref, hidden: [] }).map((c) => {
            const on = c.id === 'name' || !pref.hidden.some((h) => h === c.id)
            return (
              <MenuItem
                key={c.id}
                role="menuitemcheckbox"
                aria-checked={on}
                disabled={c.id === 'name'}
                onClick={() => setPreference('tasks.table', toggleColumn(pref, c.id))}
                sx={{ gap: 1, fontSize: 'var(--font-md)' }}
              >
                <Box component="span" sx={{ width: 20, display: 'inline-flex' }}>
                  {on ? <CheckOutlined aria-hidden="true" sx={{ fontSize: 'var(--font-lg)' }} /> : null}
                </Box>
                {th.teamTasks.table.columns[c.id]}
              </MenuItem>
            )
          })}
        </Menu>
        <FormControlLabel
          label={th.teamTasks.table.groupByProject}
          control={
            <Switch
              size="small"
              checked={pref.groupByProject}
              onChange={(_e, v) => setPreference('tasks.table', { ...pref, groupByProject: v })}
            />
          }
        />
        <span className={styles.hint}>{th.teamTasks.table.hint}</span>
      </div>

      <div ref={scrollRef} className={styles.scroller}>
        <div
          ref={gridRef}
          role="grid"
          aria-label={th.teamTasks.table.label}
          aria-rowcount={rows.length + 1}
          aria-colcount={columns.length}
          className={styles.grid}
          style={{ width: totalWidth }}
        >
          <div role="row" aria-rowindex={1} className={`${styles.row} ${styles.header}`}>
            {columns.map((c) => {
              const label = th.teamTasks.table.columns[c.id]
              const dir = sort?.column === c.id ? sort.dir : null
              return (
                <div
                  key={c.id}
                  role="columnheader"
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                  data-column={c.id}
                  className={`${styles.headCell} ${c.id === 'name' ? styles.nameCell : ''}`}
                  style={colStyle(c)}
                >
                  <button
                    type="button"
                    className={styles.headButton}
                    title={th.teamTasks.table.sortBy(label)}
                    onClick={() => setSort(nextSort(sort, c.id))}
                  >
                    <span className={styles.headText}>{label}</span>
                    {dir ? (
                      <span className={styles.sortGlyph} aria-hidden="true">
                        {dir === 'asc' ? '↑' : '↓'}
                      </span>
                    ) : null}
                  </button>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={th.teamTasks.table.resize(label)}
                    aria-valuenow={c.width}
                    aria-valuemin={64}
                    aria-valuemax={640}
                    tabIndex={0}
                    className={styles.resizer}
                    data-active={resizing?.column === c.id ? 'true' : undefined}
                    onPointerDown={(e) => startResize(e, c)}
                    onKeyDown={(e) => onResizeKey(e, c)}
                  />
                </div>
              )
            })}
          </div>
          {padTop > 0 ? <div aria-hidden="true" style={{ height: padTop }} /> : null}
          {shown.map(({ item }) => {
            if (item.kind === 'group') {
              const pr = p.projectOf(item.projectId)
              return (
                <div key={`g:${item.projectId}`} role="row" data-team-group={item.projectId}>
                  <div role="gridcell" aria-colspan={columns.length} className={styles.groupRow} style={{ width: totalWidth }}>
                    <span className={styles.groupLabel}>
                      <span aria-hidden="true" className={styles.projectDot} style={{ background: pr.color || undefined }} />
                      {th.teamTasks.table.group(pr.name, item.count)}
                    </span>
                  </div>
                </div>
              )
            }
            const card = item.card
            const r = item.rowIndex
            return (
              <div
                key={card.id}
                role="row"
                aria-rowindex={r + 2}
                data-task-id={card.id}
                data-open-host=""
                data-menu={rowMenu?.card.id === card.id ? 'true' : undefined}
                className={styles.row}
                onClick={(e) => onRowClick(e, card)}
                onContextMenu={(e) => onRowContextMenu(e, card)}
              >
                {columns.map((c, ci) => {
                  const isActive = act.row === r && act.col === ci
                  return (
                    <div
                      key={c.id}
                      role="gridcell"
                      data-cell={`${r}:${ci}`}
                      data-column={c.id}
                      data-active={isActive ? 'true' : undefined}
                      tabIndex={isActive ? 0 : -1}
                      aria-label={cellLabel(card, c.id)}
                      className={`${styles.cell} ${c.id === 'name' ? styles.nameCell : ''}`}
                      style={colStyle(c)}
                      onFocus={(e) => {
                        if (e.target === e.currentTarget && !isActive) setActiveState({ row: r, col: ci })
                      }}
                      onKeyDown={(e) => onCellKeyDown(e, { row: r, col: ci }, card, c.id)}
                    >
                      {renderCell(card, c.id)}
                    </div>
                  )
                })}
              </div>
            )
          })}
          {padBottom > 0 ? <div aria-hidden="true" style={{ height: padBottom }} /> : null}
        </div>
      </div>

      {/* editors (one at a time) */}
      <StatusMenu
        statuses={editing?.column === 'status' && editingCard ? (p.statusesByProject[editingCard.projectId] ?? []) : []}
        currentId={editingCard?.status.id ?? null}
        anchorEl={editing?.column === 'status' ? editing.anchor : null}
        onPick={(statusId) => {
          if (editingCard) p.onPickStatus(editingCard, statusId)
        }}
        onClose={closeEditor}
      />
      {editing && editingCard && (editing.column === 'startDate' || editing.column === 'dueDate') ? (
        <DateEditor
          anchor={editing.anchor}
          card={editingCard}
          column={editing.column}
          onPick={(v) => {
            p.edits.setDates(editingCard, { [editing.column]: v })
            closeEditor()
          }}
          onClose={closeEditor}
        />
      ) : null}
      {editing && editingCard && editing.column === 'milestone' ? (
        <Menu
          open
          anchorEl={editing.anchor}
          onClose={closeEditor}
          slotProps={{ list: { 'aria-label': th.teamTasks.table.milestoneMenu } }}
        >
          <MenuItem
            role="menuitemradio"
            aria-checked={editingCard.milestoneId === null}
            selected={editingCard.milestoneId === null}
            onClick={() => {
              p.edits.setMilestone(editingCard, null)
              closeEditor()
            }}
          >
            {th.milestones.none}
          </MenuItem>
          {(p.milestonesByProject[editingCard.projectId] ?? []).map((m) => (
            <MenuItem
              key={m.id}
              role="menuitemradio"
              aria-checked={editingCard.milestoneId === m.id}
              selected={editingCard.milestoneId === m.id}
              onClick={() => {
                p.edits.setMilestone(editingCard, m)
                closeEditor()
              }}
              sx={{ gap: 1 }}
            >
              <span aria-hidden="true" style={{ color: milestoneColorVar(m.color) }}>
                {th.milestones.diamond}
              </span>
              {th.milestones.tasks.groupHeader(m.name, formatThaiDate(m.date))}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
      {editing && editingCard && editing.column === 'assignees' ? (
        <Popover
          open
          anchorEl={editing.anchor}
          onClose={closeEditor}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          slotProps={{
            paper: { role: 'dialog', 'aria-label': th.teamTasks.table.assigneeEditor(editingCard.name) },
          }}
        >
          <AssigneeEditor card={editingCard} people={p.people} edits={p.edits} onClose={closeEditor} />
        </Popover>
      ) : null}

      <Menu
        open={rowMenu !== null}
        onClose={() => {
          setRowMenu(null)
          setFocusTick((n) => n + 1)
        }}
        anchorReference="anchorPosition"
        {...(rowMenu ? { anchorPosition: rowMenu.anchor } : {})}
        slotProps={{ list: { 'aria-label': th.teamTasks.table.rowMenu.label } }}
      >
        <MenuItem
          onClick={() => {
            const c = rowMenu?.card
            setRowMenu(null)
            if (c) p.onOpen(c)
          }}
        >
          <ListItemIcon>
            <OpenInNewOutlined fontSize="small" aria-hidden="true" />
          </ListItemIcon>
          <ListItemText>{th.teamTasks.table.rowMenu.open}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            const c = rowMenu?.card
            setRowMenu(null)
            if (c) openPage(c)
          }}
        >
          <ListItemIcon>
            <NorthEastOutlined fontSize="small" aria-hidden="true" />
          </ListItemIcon>
          <ListItemText>{th.teamTasks.table.rowMenu.openPage}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            const c = rowMenu?.card
            setRowMenu(null)
            if (c) p.edits.remove(c)
            setFocusTick((n) => n + 1)
          }}
        >
          <ListItemIcon>
            <DeleteOutlined fontSize="small" aria-hidden="true" />
          </ListItemIcon>
          <ListItemText>{th.teamTasks.table.rowMenu.delete}</ListItemText>
        </MenuItem>
      </Menu>
    </div>
  )
}

/** One-click date pick (MUI X DateCalendar, Buddhist-era adapter from AppProviders) + ล้างวันที่. ISO at the edge. */
function DateEditor({
  anchor,
  card,
  column,
  onPick,
  onClose,
}: {
  anchor: HTMLElement
  card: TeamTaskCard
  column: 'startDate' | 'dueDate'
  onPick: (v: ISODate | null) => void
  onClose: () => void
}) {
  const value = card[column]
  const min = column === 'dueDate' ? isoToDayjs(card.startDate) : null
  const max = column === 'startDate' ? isoToDayjs(card.dueDate) : null
  const label = column === 'startDate' ? th.teamTasks.table.date.start : th.teamTasks.table.date.due
  return (
    <Popover
      open
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { role: 'dialog', 'aria-label': label } }}
    >
      <div className={styles.editor} data-testid="team-date-editor">
        <DateCalendar
          autoFocus
          value={isoToDayjs(value)}
          {...(min ? { minDate: min } : {})}
          {...(max ? { maxDate: max } : {})}
          onChange={(d, state) => {
            if (state === 'finish' || state === undefined) onPick(dayjsToIso(d))
          }}
        />
        <Button size="small" disabled={value === null} onClick={() => onPick(null)} sx={{ justifySelf: 'start' }}>
          {th.teamTasks.table.date.clear}
        </Button>
      </div>
    </Popover>
  )
}

/**
 * Assignees of one task: M3's chips (× = unassign with undo) + AssigneePicker on the task's project data (members,
 * LEAD/Manager reach, leaf check — BR-31/60). A parent shows its read-only union and the hint, as in the panel.
 */
function AssigneeEditor({
  card,
  people,
  edits,
  onClose,
}: {
  card: TeamTaskCard
  people: ReadonlyMap<string, PersonOption>
  edits: TeamTaskEdits
  onClose: () => void
}) {
  const q = useProjectTasks(card.projectId)
  const m = useTaskMutations(card.projectId)
  const data = q.data
  const task = useMemo(() => (data ? buildTaskRows(data.tasks).find((t) => t.id === card.id) : undefined), [data, card.id])
  const memberIds = useMemo(() => new Set(data?.members.map((x) => x.userId) ?? []), [data])
  if (!data) {
    return (
      <Box className={styles.editor}>
        <CircularProgress size={20} aria-label={th.common.loading} />
      </Box>
    )
  }
  if (!task) {
    return (
      <Box className={styles.editor}>
        <Typography variant="body2">{th.tasks.panel.notFound}</Typography>
      </Box>
    )
  }
  const canEdit = data.viewer.canEdit
  return (
    <Box className={styles.editor} sx={{ width: 320 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        <AssigneeChips
          assignees={task.assignees}
          unionUserIds={task.isLeaf ? [] : card.assigneeIds}
          isLeaf={task.isLeaf}
          people={people}
          canEdit={canEdit}
          onUnassign={(id, label) => {
            const userId = task.assignees.find((a) => a.assignmentId === id)?.userId
            if (userId) edits.patchAssignees(card.id, (ids) => ids.filter((x) => x !== userId))
            m.unassign([id], label)
          }}
        />
      </Box>
      {task.isLeaf && canEdit ? (
        <AssigneePicker
          projectId={card.projectId}
          taskId={card.id}
          projectMemberIds={memberIds}
          assignedUserIds={new Set(task.assignees.map((a) => a.userId))}
          canManage={data.viewer.canManage}
          autoFocus
          onClose={onClose}
          onAssigned={(userId) => edits.patchAssignees(card.id, (ids) => (ids.includes(userId) ? ids : [...ids, userId]))}
        />
      ) : (
        <Typography variant="body2" className={styles.muted}>
          {task.isLeaf ? th.teamTasks.table.readOnly : th.tasks.panel.parentAssigneesHint}
        </Typography>
      )}
    </Box>
  )
}
