'use client'
// src/components/grid/PlanGrid.tsx — the planning grid (SPEC §4.8, §7.4, §7.5, §8.3, §8.9; PLAN §3.10; plan/m06 S3).
// Thin orchestration: pure model in src/lib/grid/*, chunk queries (useGridChunks), save queue (useSaveAllocations),
// gestures (useGridEditing / useGridKeyboard / useGridClipboard / useFillHandle), undo (useGridUndo), rendering
// (VirtualGrid + GridCell + RowHeader + GridHeader + Footer). Task rows reuse M3's mutations (create, delete, assign,
// unassign) with their undo entries and toasts (M6-D19).
// M7 (plan/m07 S3): zoom [สัปดาห์ | วัน] + inline week expansion (view only, useExpansion), day / รวม columns,
// derived day values, day editing through the same gesture pipeline, the BR-24 dialog (pre-emptive, server fallback),
// ↕ collapse-to-week (BR-23) in the รวม cell and the cell menu, day-level overload glyphs and footer tones.
// M7.1 (plan/m07.1 S3): two frozen columns งาน / ผู้รับผิดชอบ with a resizable task column (FR-814/816), show/hide
// assignees with summed rows (FR-816/817, cellRowOf + SumModeHint), the month header row + month boundaries
// (FR-818, HEADER_ROWS = 2), plan markers (FR-819/820: usePlanMarkers, MarkerLayer, MarkerPopover, MarkersMenu, header
// context menu), row reorder by drag / Alt+arrows through M3's moveTask with an optimistic grid patch (FR-815,
// applyRowMove), and the กราฟภาระ pane under the grid sharing the footer's includeOthers (FR-813).
// M8 (plan/m08 S3): the ◆ Milestones header row on top (HEADER_ROWS = 3), its popovers / menu / drag / create
// (useGridMilestones), dash-dot milestone lines in the marker layer (FR-820), "→◆" + "เลย milestone" on task rows and
// "+ milestone" in the toolbar.
// M9 (plan/m09 S3, M9-D12/D13/D28/D29): the person context — project header rows (collapsible, read-only sums), merged
// task rows of every project of the person, the masked "งานในโปรเจคอื่น" row last; no structure affordances (no quick
// add, "+ คน", ×, row Delete / move, N shortcut, includeOthers switch, assignee column, chart, markers); the footer is the
// person's full load "ภาระรวม (ทุกโปรเจค)"; `focusWeek` opens and marks a week (?week=). Week-level footer tones +
// BR-40 glyphs in both contexts (M9-D13, X06); ◆ read-only with a project-name prefix (M9-D29).
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useQueryClient } from '@tanstack/react-query'
import type { VirtualItem } from '@tanstack/react-virtual'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { viewLoad } from '@/domain/certainty'
import { addWeeks, isoWeekday, weekStart } from '@/domain/dates'
import { formatCd } from '@/domain/units'
import type { Cd, ISODate, LoadPair, PeriodKey } from '@/domain/types'
import { LoadChartPanel } from '@/components/load-chart/LoadChartPanel'
import { QuickAdd } from '@/components/tasks/QuickAdd'
import { useProjectTasks } from '@/components/tasks/useProjectTasks'
import { useTaskMutations } from '@/components/tasks/useTaskMutations'
import { useHotkeys } from '@/hooks/useHotkeys'
import { usePreferences } from '@/hooks/usePreferences'
import { useToday } from '@/hooks/useToday'
import { th } from '@/i18n/th'
import type { GridResponse, GridZoom } from '@/lib/contracts/grid'
import type { GridMarkerView, PlanMarkerDTO } from '@/lib/contracts/plan-markers'
import { formatWeekHeader } from '@/lib/format'
import {
  type BoxScroll,
  consumePopNavigation,
  currentScrollKey,
  takeBoxScroll,
} from '@/lib/nav/scroll-memory'
import { footerTotals, projectTotals, rowTotalView, taskRowTotals, taskTotals } from '@/lib/grid/aggregate'
import { findDayWeekConflicts, splitByConflicts, type ConflictPair } from '@/lib/grid/br24'
import { collapseChanges, dayTargetsOf, type CollapseTarget } from '@/lib/grid/collapse'
import {
  buildColumns,
  chunksForRange,
  columnIndexOfPeriod,
  FROZEN_COL_W,
  FROZEN_COLS,
  HEADER_ROWS,
  HEADER_TOTAL_H,
  ROW_H,
  timelineWeeks,
  totalColIndex,
  TOTAL_COL_W,
  type GridColumn,
} from '@/lib/grid/columns'
import { dayCtxFor } from '@/lib/grid/day'
import { footerDayCell, personDayStatus, type DayStatus, type FooterDayCell } from '@/lib/grid/day-footer'
import {
  footerPeriodCell,
  periodStatus,
  personPeriodLoads,
  type FooterPeriodCell,
  type PeriodStatus,
} from '@/lib/grid/load-footer'
import { causeText, twoDecimals } from '@/lib/workload/format'
import { frozenWidths } from '@/lib/grid/frozen'
import {
  INITIAL_HOLD_MAX_MS,
  INITIAL_HOLD_SETTLE_MS,
  initialColumnLeft,
  initialHoldStep,
} from '@/lib/grid/initial-scroll'
import { chartWeeks, memberLoadSeries } from '@/lib/grid/load-series'
import {
  defaultMarkerDate,
  defaultToolbarMarkerDate,
  markerEdgeColumn,
  markerEdges,
  toMarkerViews,
  type MarkerEdge,
} from '@/lib/grid/markers'
import type { GridModel } from '@/lib/grid/merge'
import { monthStartKeys } from '@/lib/grid/months'
import type { CellWrite } from '@/lib/grid/queue'
import { applyRowMove } from '@/lib/grid/row-drop'
import {
  buildPersonViewRows,
  buildViewRows,
  cellEditability,
  cellRowOf,
  isTaskViewRow,
  projectRowOf,
  type AnyViewRow,
  type CellRow,
  type GridViewRow,
  type PersonViewRow,
  type RowKey,
} from '@/lib/grid/rows'
import { cellsOf } from '@/lib/grid/selection'
import { targetGrid } from '@/lib/grid/targets'
import {
  cellMarks,
  dayHeaderTooltipFor,
  headerRowTooltipFor,
  headerTooltipFor,
  tooltipFor,
} from '@/lib/grid/tooltip'
import { rememberVersion } from '@/lib/grid/versions'
import type { GridCtx } from '@/lib/query-keys'
import { qk } from '@/lib/query-keys'
import { PLAN_MARKER_LIMIT } from '@/lib/schemas/plan-markers'
import { gridPreference, taskPreference } from '@/lib/schemas/preferences'
import {
  flattenTree,
  indentTarget,
  moveDownTarget,
  moveUpTarget,
  outdentTarget,
  TASK_MAX_DEPTH_INDEX,
  type Placement,
} from '@/lib/tree/ops'
import { ColumnResizeHandle } from './ColumnResizeHandle'
import { DropIndicator } from './DropIndicator'
import { MarkerFlags, MarkerLines, markerName, paddingOf, renderedEdges } from './MarkerLayer'
import { MarkerPopover } from './MarkerPopover'
import { MarkersMenu } from './MarkersMenu'
import { MonthHeader } from './MonthHeader'
import { PersonRowHeader } from './PersonRowHeader'
import { SumModeHint } from './SumModeHint'
import { usePlanMarkers } from './usePlanMarkers'
import { useRowDrag } from './useRowDrag'
import { CellTooltip } from './CellTooltip'
import { Footer } from './Footer'
import { GridCell } from './GridCell'
import { GridHeader } from './GridHeader'
import { GridLegend, GridToolbar } from './GridToolbar'
import { AddPersonPopover, type PickerContext } from './AddPersonPopover'
import { Br24Dialog } from './Br24Dialog'
import { CellMenu, type CellMenuItem } from './CellMenu'
import { createGridStore } from './gridStore'
import { RowHeader } from './RowHeader'
import { useFillHandle } from './useFillHandle'
import { useGridChunks } from './useGridChunks'
import { useGridClipboard } from './useGridClipboard'
import { useGridEditing, type GridAccess } from './useGridEditing'
import { useGridKeyboard, type GridKeyHandlers } from './useGridKeyboard'
import { useDayWeekChoice } from './useDayWeekChoice'
import { useExpansion } from './useExpansion'
import { useGridMilestones } from './useGridMilestones'
import { useGridUndo } from './useGridUndo'
import { useSaveAllocations } from './useSaveAllocations'
import { VirtualGrid, type VirtualGridHandle } from './VirtualGrid'
import styles from './grid.module.css'

/** M6 props. Later milestones only ADD optional props (C37): M7 `initialZoom?: GridZoom`; M9 `label?: string`
 *  (aria-label override) and `focusWeek?: ISODate`. `onOpenTask` already takes the optional `projectId` M9's person
 *  grid passes; the project plan page ignores it. */
export interface PlanGridProps {
  context: GridCtx
  projectName: string
  archived: boolean
  canEdit: boolean
  onOpenTask: (taskId: string, projectId?: string) => void
  /** M7 (S3.11): the `grid.zoom` preference read by the page on the server; absent → usePreferences */
  initialZoom?: GridZoom
  /** M7.1 (FR-814/816/813): server-read preferences `grid.taskColumnWidth`, `grid.showAssignees`, `grid.chart`;
   *  absent → usePreferences */
  initialTaskColumnWidth?: number
  initialShowAssignees?: boolean
  initialChartOpen?: boolean
  /** M7.1 (FR-810): first child of the toolbar row (the plan page's view switch) */
  toolbarStart?: ReactNode
  /** M9: aria-label override of the grid (th.people.grid.label(name)) */
  label?: string
  /** M9 (M9-D28): `?week=` — the grid opens with this week as the first column and marks its header */
  focusWeek?: ISODate
}

/** M7.1-D5: the chart's x-weeks follow the rendered columns, debounced. */
const CHART_RANGE_DEBOUNCE_MS = 150

/** First column of a week (its first day column when expanded); −1 when absent. */
function firstColOfWeek(cols: readonly GridColumn[], week: string): number {
  return cols.findIndex((c) => c.weekStart === week)
}

/** D: keys "D:2026-09-28,D:2026-09-29" → dates per week (stable input of buildColumns). */
function dayDatesOf(sig: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (sig === '') return out
  for (const k of sig.split(',')) {
    const d = k.slice(2)
    const w = weekStart(d)
    const list = out.get(w)
    if (list) list.push(d)
    else out.set(w, [d])
  }
  return out
}

const EMPTY_TOTALS = new Map<string, Partial<Record<PeriodKey, LoadPair>>>()
const EMPTY_LOADS = new Map<string, Partial<Record<PeriodKey, LoadPair>>>()
const EMPTY_ROW_TOTALS = new Map<string, LoadPair>()
const days1 = (cd: Cd) => formatCd(cd, { unit: 'DAYS', decimals: 1 })
const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

export function PlanGrid(props: PlanGridProps): JSX.Element {
  const { context, projectName, onOpenTask } = props
  const isPerson = context.kind === 'person'
  const today = useToday()
  const thisWeek = weekStart(today)
  // M9 (M9-D28): the week the grid opens on (and marks); null = M6's default (this week − 4)
  const openWeek = props.focusWeek ? weekStart(props.focusWeek) : null
  const { prefs, setPreference } = usePreferences()
  const unit = gridPreference(prefs, 'grid.unit')
  const view = gridPreference(prefs, 'load.view')
  const showCompleted = taskPreference(prefs, 'tasks.showCompleted')
  const [includeOthers, setIncludeOthers] = useState(false)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  // ── M7.1 view preferences (FR-813/814/816, X53: user_preferences, never localStorage) ──
  const [showAssigneesPref, setShowAssigneesState] = useState(
    () => props.initialShowAssignees ?? gridPreference(prefs, 'grid.showAssignees'),
  )
  // M9 forward note (M7.1): the person grid has no assignee column (every row is that person's) and no toggle
  const showAssignees = isPerson ? false : showAssigneesPref
  const [taskWidthPref, setTaskWidthPref] = useState(
    () => props.initialTaskColumnWidth ?? gridPreference(prefs, 'grid.taskColumnWidth'),
  )
  const [chartPref, setChartOpen] = useState(
    () => props.initialChartOpen ?? gridPreference(prefs, 'grid.chart'),
  )
  // the กราฟภาระ pane is the project's member chart (M7.1 FR-813) — not part of the person grid (M9 scope)
  const chartOpen = isPerson ? false : chartPref
  const [rendered, setRendered] = useState<{ first: number; last: number } | null>(null)
  const [gridWidth, setGridWidth] = useState(0)

  // ── zoom + expansion (FR-802/803, M7-D10/D11; view only, never data) ──
  const exp = useExpansion(context, props.initialZoom ?? gridPreference(prefs, 'grid.zoom'))
  const zoom = exp.state.zoom
  const weeks = useMemo(() => timelineWeeks(today), [today])
  const expandedSet = useMemo(
    () => (zoom === 'DAY' ? new Set(weeks) : exp.state.expanded),
    [zoom, weeks, exp.state.expanded],
  )

  // ── chunks + columns (FR-801, M6-D15, M7-D24) ──
  const [chunkStarts, setChunkStarts] = useState(() =>
    openWeek
      ? chunksForRange(today, addWeeks(openWeek, -4), addWeeks(openWeek, 16))
      : chunksForRange(today, addWeeks(thisWeek, -4), addWeeks(thisWeek, 16)),
  )
  const chunks = useGridChunks(context, chunkStarts, includeOthers, exp.state)
  const raw = chunks.model
  const daySig = useMemo(
    () =>
      raw
        ? raw.periods
            .filter((x) => x.kind === 'DAY')
            .map((x) => x.key)
            .join(',')
        : '',
    [raw],
  )
  const dayDates = useMemo(() => dayDatesOf(daySig), [daySig])
  const cols = useMemo(() => buildColumns(weeks, expandedSet, dayDates), [weeks, expandedSet, dayDates])
  const focusIdx = useMemo(() => (openWeek ? firstColOfWeek(cols, openWeek) : -1), [cols, openWeek])
  const initialIdx = useMemo(
    () => (focusIdx >= 0 ? focusIdx : Math.max(0, firstColOfWeek(cols, addWeeks(thisWeek, -4)))),
    [cols, thisWeek, focusIdx],
  )
  const todayIdx = useMemo(() => {
    const d = columnIndexOfPeriod(cols, `D:${today}`)
    return d >= 0 ? d : Math.max(firstColOfWeek(cols, thisWeek), columnIndexOfPeriod(cols, `W:${thisWeek}`))
  }, [cols, today, thisWeek])
  const rangeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(rangeTimer.current), [])
  const onRangeChange = useCallback(
    (first: number, last: number) => {
      const a = cols[first]
      const b = cols[last]
      if (!a || !b) return
      const next = chunksForRange(today, a.weekStart, b.weekStart)
      setChunkStarts((prev) => (sameList(prev, next) ? prev : next))
      clearTimeout(rangeTimer.current)
      rangeTimer.current = setTimeout(
        () =>
          setRendered((prev) =>
            prev && prev.first === first && prev.last === last ? prev : { first, last },
          ),
        CHART_RANGE_DEBOUNCE_MS,
      )
    },
    [cols, today],
  )
  const archived = !isPerson && (props.archived || (raw?.context.kind === 'project' && raw.context.archived))
  const model = useMemo<GridModel | null>(() => {
    if (!raw) return null
    if (raw.context.kind === 'person') {
      // M9: per-row rights come from the server (assignee.editable, project row canEdit); the page may lock it all
      const canEdit = raw.context.canEdit && props.canEdit
      return canEdit === raw.context.canEdit ? raw : { ...raw, context: { ...raw.context, canEdit } }
    }
    const canEdit = raw.context.canEdit && props.canEdit && !archived
    // M8-D8: archived projects never manage milestones (the server already says so; the page prop may know first)
    const canManage = raw.context.canManage && !archived
    return canEdit === raw.context.canEdit && archived === raw.context.archived && canManage === raw.context.canManage
      ? raw
      : { ...raw, context: { ...raw.context, canEdit, archived, canManage } }
  }, [raw, props.canEdit, archived])
  const canEdit = model ? model.context.canEdit : props.canEdit && !archived

  useEffect(() => {
    for (const r of model?.rows ?? [])
      if (r.kind === 'assignee') rememberVersion(r.taskAssignmentId, r.version)
  }, [model])

  // ── derived rows / sums (FR-805/806/809) ──
  // M7.1 (FR-816): hidden assignees → one `sum` row per task; cellRows = the rows whose cells each row shows (a
  // single-assignee sum row = its merged assignment row, BR-101; every other sum row = its task totals, BR-100)
  // M9: the person context has its own row model (project → merged rows, masked last; M9-D12)
  const projectViewRows = useMemo<GridViewRow[]>(
    () => (model && !isPerson ? buildViewRows(model, { showCompleted, collapsed, showAssignees }) : NO_ROWS),
    [model, isPerson, showCompleted, collapsed, showAssignees],
  )
  const personViewRows = useMemo<PersonViewRow[]>(
    () => (model && isPerson ? buildPersonViewRows(model, { showCompleted, collapsed }) : NO_PERSON_ROWS),
    [model, isPerson, showCompleted, collapsed],
  )
  const viewRows: readonly AnyViewRow[] = isPerson ? personViewRows : projectViewRows
  const cellRows = useMemo<CellRow[]>(() => viewRows.map((r) => cellRowOf(r)), [viewRows])
  const totals = useMemo(
    () => (model ? taskTotals(model, cellRows.filter(isTaskViewRow)) : EMPTY_TOTALS),
    [model, cellRows],
  )
  const projTotals = useMemo(
    () => (model && isPerson ? projectTotals(model, cellRows) : EMPTY_TOTALS),
    [model, isPerson, cellRows],
  )
  const rowTotals = useMemo(() => (model ? taskRowTotals(model) : EMPTY_ROW_TOTALS), [model])
  const footer = useMemo(
    () => (model ? footerTotals(model, { includeOthers }) : { people: [], cells: {} }),
    [model, includeOthers],
  )
  const footerNames = useMemo(() => footer.people.map((u) => model?.people[u]?.name ?? ''), [footer, model])
  const holidayWeeks = useMemo(
    () => new Set([...(model?.holidays.keys() ?? [])].map((d) => weekStart(d))),
    [model],
  )
  // ── M7 day-level + M9 week-level load (BR-40/41/45, M7-D13, M9-D13): once per data change, never per cell ──
  // D: keys = M7's personDayLoads (person context: + the masked row, no `extra`); W: keys = Σ cells (+ masked /
  // otherProjects) — one sum per key (C38)
  const dayLoads = useMemo(
    () => (model ? personPeriodLoads(model, model.periods, { includeOthers }) : EMPTY_LOADS),
    [model, includeOthers],
  )
  const footerDays = useMemo(() => {
    const out = new Map<string, FooterDayCell>()
    if (!model) return out
    for (const per of model.periods) {
      if (per.kind !== 'DAY') continue
      const statuses = new Map<string, DayStatus>()
      for (const u of footer.people)
        statuses.set(u, personDayStatus(dayLoads.get(u), model.people[u], per.key))
      out.set(
        per.key,
        footerDayCell(statuses, view, (u) => model.people[u]?.name ?? ''),
      )
    }
    return out
  }, [model, footer.people, dayLoads, view])
  const footerWeeks = useMemo(() => {
    const out = new Map<string, FooterPeriodCell>()
    if (!model) return out
    for (const per of model.periods) {
      if (per.kind !== 'WEEK') continue
      const statuses = new Map<string, PeriodStatus>()
      for (const u of footer.people) {
        const person = model.people[u]
        if (person) statuses.set(u, periodStatus(dayLoads.get(u)?.[per.key], person, per.key))
      }
      out.set(per.key, footerPeriodCell(statuses, view, (u) => model.people[u]?.name ?? ''))
    }
    return out
  }, [model, footer.people, dayLoads, view])

  // ── M3 task data: blocker names (M6-D31), picker members, task mutations (M6-D19) ──
  // not fetched for the person context (its id is a user id; blocker names stay in the project's own views, X76; no
  // picker, no reorder)
  const tasksQ = useProjectTasks(context.id, { enabled: !isPerson })
  const taskMut = useTaskMutations(context.id)
  // M9: the person grid passes the task's project (→ /projects/<pid>/plan?task=, M9-D28)
  const projectOfTask = useMemo(() => {
    const out = new Map<string, string>()
    for (const r of model?.rows ?? []) if (r.kind === 'task' && r.projectId !== undefined) out.set(r.id, r.projectId)
    return out
  }, [model])
  const openTask = useCallback(
    (taskId: string) => {
      const projectId = projectOfTask.get(taskId)
      if (projectId === undefined) onOpenTask(taskId)
      else onOpenTask(taskId, projectId)
    },
    [onOpenTask, projectOfTask],
  )
  const blockerNames = useMemo(() => {
    const out = new Map<string, string[]>()
    const d = tasksQ.data
    if (!d) return out
    const names = new Map(d.tasks.map((t) => [t.id, t.name]))
    for (const e of d.blockerEdges) {
      const n = names.get(e.blockerTaskId)
      if (n === undefined) continue
      const list = out.get(e.taskId)
      if (list) list.push(n)
      else out.set(e.taskId, [n])
    }
    return out
  }, [tasksQ.data])
  const picker = useMemo<PickerContext | null>(() => {
    const d = tasksQ.data
    if (!d) return null
    return {
      projectId: context.id,
      projectMemberIds: new Set(d.members.map((m) => m.userId)),
      canManage: d.viewer.canManage,
    }
  }, [tasksQ.data, context.id])
  const assignedByTask = useMemo(() => {
    const out = new Map<string, Set<string>>()
    for (const r of model?.rows ?? []) {
      if (r.kind !== 'assignee') continue
      const s = out.get(r.taskId) ?? new Set<string>()
      s.add(r.userId)
      out.set(r.taskId, s)
    }
    return out
  }, [model])

  // ── store, save, undo ──
  const [store] = useState(createGridStore)
  const choice = useDayWeekChoice()
  const modelRef = useRef<GridModel | null>(model)
  useLayoutEffect(() => {
    modelRef.current = model
  })
  /** BR-24 pairs of writes against the current cache (server fallback: NEEDS_CHOICE, M7-D4). */
  const onNeedsChoice = useCallback(
    (payload: { pairs: { taskAssignmentId: string; week: string }[] }, writes: readonly CellWrite[]) => {
      const m = modelRef.current
      const keys = new Set(payload.pairs.map((x) => `${x.taskAssignmentId}|${x.week}`))
      const pairs = m
        ? findDayWeekConflicts(
            writes.filter((w) => w.granularity === 'WEEK' && keys.has(`${w.taskAssignmentId}|${w.period}`)),
            m,
          )
        : []
      return pairs.length > 0 ? choice.ask(pairs) : Promise.resolve(null)
    },
    [choice],
  )
  const save = useSaveAllocations(context, { onConflict: choice.dropAssignments, onNeedsChoice })
  const { gesture, start, undo, redo } = useGridUndo(context, save)

  /**
   * Every value gesture (type, f/h, Delete, paste, fill, shift) runs here (X65, M7-D4): WEEK writes onto DAY weeks
   * (≠ Σ days) are held back while the one BR-24 dialog of the gesture is open; the rest is enqueued at once. One undo
   * entry for the whole gesture. Cancel drops only those pairs.
   */
  const runGesture = useCallback(
    (label: string, writes: readonly CellWrite[]) => {
      const m = modelRef.current
      const pairs: ConflictPair[] = m ? findDayWeekConflicts(writes, m) : []
      if (pairs.length === 0) return gesture(label, writes)
      const { plain, conflicting } = splitByConflicts(writes, pairs)
      const g = start(writes)
      g.send(plain)
      return choice.ask(pairs).then((c) => {
        if (c) g.send(conflicting, c)
        return g.finish(
          c === 'SCALE' ? th.grid.day.undo.scale : c === 'COLLAPSE' ? th.grid.day.undo.collapse : label,
        )
      })
    },
    [gesture, start, choice],
  )

  /** BR-23 "↕ รวมเป็นรายสัปดาห์" (M7-D2): WEEK = Σ days with COLLAPSE; undo toast, no confirm (P2). */
  const collapseToWeek = useCallback(
    (targets: readonly CollapseTarget[]) => {
      const m = model // not modelRef: the cell menu's items carry this callback as data (react-hooks/refs)
      if (!m) return
      const writes = collapseChanges(targets, m)
      if (writes.length === 0) return
      void gesture(th.grid.day.undo.collapse, writes, {
        onDayWeekConflict: 'COLLAPSE',
        toast:
          writes.length === 1 ? th.grid.day.collapsedToast : th.grid.day.collapsedManyToast(writes.length),
      })
    },
    [gesture, model],
  )
  const gridRef = useRef<VirtualGridHandle>(null)
  const quickRef = useRef<HTMLInputElement>(null)
  const rootId = useId()
  // M7.1 (FR-817): the summed read-only cell that shows SumModeHint
  const [sumHint, setSumHint] = useState<{
    r: number
    c: number
    people: number
    anchor: Element | null
  } | null>(null)

  // ── M7.1 row reorder (FR-815, BR-105, M7.1-D16–D18): M3's moveTask through useTaskMutations (undo, FR-610 toast,
  // server validation); the grid order is patched optimistically and refetched on settle (invalidateTasks → gridAll) ──
  const qc = useQueryClient()
  const canReorder = canEdit && !archived && (tasksQ.data?.viewer.canEdit ?? false)
  const treeItems = useMemo(() => (tasksQ.data ? flattenTree(tasksQ.data.tasks) : null), [tasksQ.data])
  const patchGridMove = useCallback(
    (taskId: string, placement: Placement) => {
      const m = modelRef.current
      // a move under a leaf with assignees transfers them (BR-31): no optimism, the server order wins (M7.1-D18)
      const parent =
        placement.parentId === null
          ? undefined
          : m?.rows.find((r) => r.kind === 'task' && r.id === placement.parentId)
      if (parent && parent.kind === 'task' && !parent.hasChildren && parent.assigneeCount > 0) return
      qc.setQueriesData<GridResponse>({ queryKey: qk.gridAll(context) }, (d) =>
        d ? applyRowMove(d, { taskId, ...placement }) : d,
      )
    },
    [qc, context],
  )
  const moveRowBy = (taskId: string, dir: 'up' | 'down' | 'in' | 'out') => {
    const items = treeItems ?? []
    const target =
      dir === 'up'
        ? moveUpTarget(items, taskId)
        : dir === 'down'
          ? moveDownTarget(items, taskId)
          : dir === 'in'
            ? indentTarget(items, taskId, TASK_MAX_DEPTH_INDEX)
            : outdentTarget(items, taskId)
    if (!target) return // top / last sibling / depth 3: a silent no-op (M3-D10)
    patchGridMove(taskId, target)
    if (dir === 'up') taskMut.moveUp(taskId)
    else if (dir === 'down') taskMut.moveDown(taskId)
    else if (dir === 'in') taskMut.indent(taskId)
    else taskMut.outdent(taskId)
  }
  const onRowDrop = useCallback(
    (taskId: string, placement: Placement) => {
      patchGridMove(taskId, placement)
      taskMut.move({ taskId, parentId: placement.parentId, afterId: placement.afterId })
    },
    [patchGridMove, taskMut],
  )
  const drag = useRowDrag({
    scroller: () => gridRef.current?.element() ?? null,
    viewRows: projectViewRows,
    items: canReorder ? treeItems : null,
    onDrop: onRowDrop,
  })

  // ── M7.1 plan markers (FR-819/820, M7.1-D11–D15) ──
  const markersEnabled = context.kind === 'project'
  const planMarkers = usePlanMarkers(context.id, { enabled: markersEnabled })
  const markerViews = useMemo<GridMarkerView[]>(
    () => toMarkerViews(planMarkers.markers, canEdit),
    [planMarkers.markers, canEdit],
  )
  // ── M8 ◆ row (FR-705/707, M8-D8–D11) + milestone lines in the same layer (FR-820, D24: lines only, no flags) ──
  const scrollEl = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return gridRef.current?.element() ?? null
      },
    }),
    [],
  )
  // M9 (S3.6): ◆ of several projects in the person grid carry their project's name
  const msProjectLabel = useCallback(
    (projectId: string) => (model ? (projectRowOf(model, projectId)?.name ?? null) : null),
    [model],
  )
  const gm = useGridMilestones({
    context,
    model,
    cols,
    scrollEl,
    today,
    thisWeek,
    ...(isPerson ? { projectLabel: msProjectLabel } : {}),
  })
  const flagEdges = useMemo(() => markerEdges(markerViews, cols), [markerViews, cols])
  const edges = useMemo(
    () => (gm.markerViews.length === 0 ? flagEdges : markerEdges([...markerViews, ...gm.markerViews], cols)),
    [flagEdges, markerViews, gm.markerViews, cols],
  )
  const monthStarts = useMemo(() => monthStartKeys(cols), [cols])
  const [markerOpen, setMarkerOpen] = useState<{ id: string; anchor: Element } | null>(null)
  const [markerStack, setMarkerStack] = useState<{ edge: MarkerEdge; anchor: Element } | null>(null)
  const openMarker = useCallback(
    (v: GridMarkerView, anchor: Element) => setMarkerOpen({ id: v.id, anchor }),
    [],
  )
  const openStack = useCallback((edge: MarkerEdge, anchor: Element) => setMarkerStack({ edge, anchor }), [])
  const canAddMarker = canEdit && markersEnabled && planMarkers.markers.length < PLAN_MARKER_LIMIT
  /** Creates at once (FR-819 "สร้างทันที") and opens its popover at `anchor`. */
  const addMarker = useCallback(
    (date: ISODate, anchor: Element | null) => {
      if (!canAddMarker) return
      const id = planMarkers.create({ date })
      if (anchor) setMarkerOpen({ id, anchor })
    },
    [canAddMarker, planMarkers],
  )
  /** "เพิ่มเส้นกำกับที่ขอบขวา" (header / cell menu): the column's default date (BR-102, M7.1-D11), anchored at its header. */
  const addMarkerAtColumn = useCallback(
    (c: number) => {
      const col = cols[c]
      if (!col) return
      // by id, not gridRef: the cell menu's items carry this callback as data (react-hooks/refs)
      const root = document.getElementById(rootId)
      addMarker(defaultMarkerDate(col), root?.querySelector(`[role="columnheader"][data-c="${c}"]`) ?? root)
    },
    [cols, addMarker, rootId],
  )
  /** Toolbar "ไปที่": scroll to the marker's edge, then open its popover at its flag (or the column header). */
  const goToMarker = useCallback(
    (m: PlanMarkerDTO) => {
      const c = markerEdgeColumn(m.date, cols)
      if (c === null) return
      gridRef.current?.scrollToColumn(Math.max(0, c - 2))
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const root = gridRef.current?.element()
          const el =
            root?.querySelector(`[data-marker-flag="${CSS.escape(m.id)}"]`) ??
            root?.querySelector(`[data-frozen-header] ~ [data-c="${c}"]`) ??
            document.querySelector('[data-testid="markers-menu"]')
          if (el) setMarkerOpen({ id: m.id, anchor: el })
        }),
      )
    },
    [cols],
  )
  const openedMarker = markerOpen ? planMarkers.find(markerOpen.id) : undefined

  // ── M7.1 frozen columns (FR-814/816, M7.1-D7/D8/D9) ──
  const refocusAfterToggle = useRef<{ taskId: string; c: number; assignee: boolean } | null>(null)
  const setShowAssignees = useCallback(
    (on: boolean, focusTask?: { taskId: string; c: number }) => {
      const s = store.get()
      const r = s.focus?.r
      const current = r === undefined ? undefined : viewRows[r]
      refocusAfterToggle.current = focusTask
        ? { ...focusTask, assignee: true }
        : current && isTaskViewRow(current) && s.focus
          ? { taskId: current.task.id, c: s.focus.c, assignee: false }
          : null
      // M7.1-D7: row keys change between a: and t: — no selection, editor or fill survives the toggle
      store.set({
        mode: 'nav',
        draft: '',
        fill: null,
        rowSelection: null,
        hasSelection: false,
        anchor: null,
        focus: null,
      })
      setSumHint(null)
      setShowAssigneesState(on)
      setPreference('grid.showAssignees', on)
    },
    [store, viewRows, setPreference],
  )
  const onTaskWidthCommit = useCallback((px: number) => setTaskWidthPref(px), [])
  const onTaskWidthSave = useCallback(
    (px: number) => setPreference('grid.taskColumnWidth', px),
    [setPreference],
  )
  const onTaskWidthLive = useCallback((px: number) => gridRef.current?.setLiveTaskWidth(px), [])
  const onChart = useCallback(
    (open: boolean) => {
      setChartOpen(open)
      setPreference('grid.chart', open)
    },
    [setPreference],
  )

  useEffect(() => {
    store.set({ home: { r: 0, c: Math.max(0, todayIdx) } })
  }, [store, todayIdx])

  const acc = useRef<GridAccess | null>(null)
  useLayoutEffect(() => {
    acc.current = {
      store,
      rowCount: viewRows.length,
      colCount: cols.length,
      target: model ? targetGrid(model, viewRows, cols, totals, projTotals) : () => null,
      unit,
      gesture: runGesture,
      scrollTo: (r, c) => gridRef.current?.scrollToCell(r, c),
      cols,
      onSumReadOnly: (p) => {
        const row = viewRows[p.r]
        setSumHint({
          r: p.r,
          c: p.c,
          people: row?.kind === 'sum' && !row.task.hasChildren ? row.assignees.length : 0,
          anchor:
            gridRef.current?.element()?.querySelector(`[data-cell][data-r="${p.r}"][data-c="${p.c}"]`) ??
            null,
        })
      },
    }
  })

  const editing = useGridEditing(acc)
  const { onCopy, onPaste } = useGridClipboard(acc)
  const pointer = useFillHandle(acc, editing)

  /** Keyboard focus to body cell (r, current column), e.g. before the row under focus goes away (§8.9). */
  const focusCell = useCallback(
    (r: number) => {
      const s = store.get()
      const p = { r, c: s.focus?.c ?? s.home.c }
      store.set({ active: true, hasSelection: true, rowSelection: null, mode: 'nav', anchor: p, focus: p })
      gridRef.current?.scrollToCell(p.r, p.c)
    },
    [store],
  )
  // rows went away (delete, unassign, filter): keep the focused position inside the body
  useLayoutEffect(() => {
    const s = store.get()
    if (!s.focus || s.focus.r < viewRows.length) return
    if (viewRows.length === 0) {
      store.set({ focus: null, anchor: null, hasSelection: false, rowSelection: null })
      return
    }
    const p = { r: viewRows.length - 1, c: s.focus.c }
    store.set({ focus: p, anchor: p })
  }, [store, viewRows.length])

  // M7.1-D7: after the assignee toggle, the focused task keeps focus (its first assignee row after [แสดงผู้รับผิดชอบ])
  useLayoutEffect(() => {
    const f = refocusAfterToggle.current
    if (!f) return
    refocusAfterToggle.current = null
    let r = f.assignee
      ? viewRows.findIndex((x) => (x.kind === 'assignee' || x.kind === 'merged') && x.task.id === f.taskId)
      : -1
    if (r < 0) r = viewRows.findIndex((x) => isTaskViewRow(x) && x.task.id === f.taskId)
    if (r < 0) return
    const p = { r, c: f.c }
    store.set({ active: true, hasSelection: true, rowSelection: null, mode: 'nav', anchor: p, focus: p })
    gridRef.current?.scrollToCell(p.r, p.c)
  }, [viewRows, store])

  /** Tab reached the grid root (its roving cell is outside the rendered window): scroll to it and focus it (§8.9). */
  const enterGrid = useCallback(() => {
    const s = store.get()
    const p = s.focus ?? s.home
    if (p.r >= viewRows.length || p.c >= cols.length) return
    // GridCell focuses itself once it is focused + active (on mount after the scroll, or right away)
    store.set({
      active: true,
      mode: 'nav',
      rowSelection: null,
      hasSelection: true,
      anchor: s.hasSelection && s.anchor ? s.anchor : p,
      focus: p,
    })
    gridRef.current?.scrollToCell(p.r, p.c)
  }, [store, viewRows.length, cols.length])
  /** ◀ / ▶ / วันนี้: the column scrolls into view; with no cell focused yet, the Tab stop follows it. */
  const scrollToColumn = useCallback(
    (index: number) => {
      const c = Math.max(0, Math.min(cols.length - 1, index))
      gridRef.current?.scrollToColumn(c)
      const s = store.get()
      if (!s.focus) store.set({ home: { r: s.home.r, c } })
    },
    [store, cols.length],
  )

  const focusQuickAdd = useCallback(() => {
    gridRef.current?.scrollToCell(viewRows.length, -1)
    requestAnimationFrame(() => quickRef.current?.focus())
  }, [viewRows.length])
  // M9-D28: no quick-add row (and no N) in the person grid
  const canAddTask = canEdit && !isPerson
  useHotkeys([{ hotkey: { code: 'KeyN' }, handler: focusQuickAdd }], { enabled: canAddTask })

  // ── expansion focus + horizontal position (M7-D11, S3.11) ──
  const refocus = useRef<{ r: number; week: string; at: 'firstDay' | 'week' } | null>(null)
  const keepWeek = useRef<string | null>(null)
  useLayoutEffect(() => {
    const k = keepWeek.current
    if (k !== null) {
      keepWeek.current = null
      const i = firstColOfWeek(cols, k)
      if (i >= 0) gridRef.current?.scrollToColumn(i)
    }
    const f = refocus.current
    if (!f) return
    refocus.current = null
    const c = firstColOfWeek(cols, f.week)
    if (c < 0) return
    const p = { r: f.r, c }
    store.set({ anchor: p, focus: p, hasSelection: true, rowSelection: null, mode: 'nav', active: true })
    gridRef.current?.scrollToCell(p.r, p.c)
  }, [cols, store])
  const onToggleWeek = useCallback((week: string) => exp.toggle(week), [exp])
  const onZoom = useCallback(
    (z: GridZoom) => {
      const first = cols[gridRef.current?.firstVisibleColumn() ?? -1]
      keepWeek.current = first?.weekStart ?? null
      exp.setZoom(z)
      setPreference('grid.zoom', z)
    },
    [cols, exp, setPreference],
  )

  // ── cell menu (Shift+F10 / ContextMenu / right click) + ↕ (M7-D23) ──
  const [menu, setMenu] = useState<{
    anchor: { rowKey: RowKey; periodKey: PeriodKey } | { x: number; y: number }
    targets: CollapseTarget[]
    /** M7.1: the column under the menu ("เพิ่มเส้นกำกับที่ขอบขวา") */
    col: number
    /** M7.1: opened on a column header — only the marker item */
    header?: boolean
  } | null>(null)
  const selectionDayTargets = useCallback((): CollapseTarget[] => {
    const m = modelRef.current
    const a = acc.current
    const s = store.get()
    const rect =
      store.rect() ?? (s.focus ? { r0: s.focus.r, c0: s.focus.c, r1: s.focus.r, c1: s.focus.c } : null)
    if (!m || !a || !rect) return []
    return dayTargetsOf(
      cellsOf(rect, a.target)
        .flat()
        .map((t) => ({ taskAssignmentId: t.editability === 'ok' ? t.taskAssignmentId : null, week: t.week })),
      m,
    )
  }, [store])
  const onContextMenu = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      // M7.1 (FR-819): right click on a period header → "เพิ่มเส้นกำกับที่ขอบขวา"
      const header = (e.target as HTMLElement).closest<HTMLElement>('[role="columnheader"][data-c]')
      if (header) {
        if (!canEdit || !markersEnabled) return
        e.preventDefault()
        const r = header.getBoundingClientRect()
        const keyboard = e.clientX === 0 && e.clientY === 0
        setMenu({
          anchor: keyboard ? { x: r.left + r.width / 2, y: r.bottom } : { x: e.clientX, y: e.clientY },
          targets: [],
          col: Number(header.dataset.c),
          header: true,
        })
        return
      }
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]')
      if (!el) return
      e.preventDefault()
      const p = { r: Number(el.dataset.r), c: Number(el.dataset.c) }
      const rect = store.rect()
      const inside = rect && p.r >= rect.r0 && p.r <= rect.r1 && p.c >= rect.c0 && p.c <= rect.c1
      if (!inside) store.set({ anchor: p, focus: p, hasSelection: true, rowSelection: null, active: true })
      // a keyboard-initiated contextmenu event (no pointer position) anchors at the cell, like Shift+F10
      const row = cellRows[p.r]
      const col = cols[p.c]
      const keyboard = e.clientX === 0 && e.clientY === 0 && row !== undefined && col !== undefined
      setMenu({
        anchor: keyboard ? { rowKey: row.key, periodKey: col.key } : { x: e.clientX, y: e.clientY },
        targets: selectionDayTargets(),
        col: p.c,
      })
    },
    [store, selectionDayTargets, cellRows, cols, canEdit, markersEnabled],
  )
  const onCollapseCell = useCallback(
    (rowKey: string, periodKey: string) => {
      const row = cellRows.find((x) => x.key === rowKey)
      if (!row || (row.kind !== 'merged' && row.kind !== 'assignee')) return
      collapseToWeek([{ taskAssignmentId: row.assignee.taskAssignmentId, week: periodKey.slice(2) }])
    },
    [cellRows, collapseToWeek],
  )
  const closeMenu = useCallback(() => setMenu(null), [])
  const closeSumHint = useCallback(() => setSumHint(null), [])

  const handlers = useRef<GridKeyHandlers | null>(null)
  useLayoutEffect(() => {
    const selectedRow = () => viewRows.find((r) => r.key === store.get().rowSelection)
    handlers.current = {
      undo: () => void undo(),
      redo: () => void redo(),
      flush: () => void save.flush(),
      newTask: focusQuickAdd,
      // M9-D28: the person grid has no row Delete
      rowDeletable: () => {
        const row = selectedRow()
        return canAddTask && row !== undefined && isTaskViewRow(row) && row.kind !== 'assignee'
      },
      deleteRow: () => {
        const row = selectedRow()
        if (!canAddTask || !row || !isTaskViewRow(row) || row.kind === 'assignee') return
        // focus leaves the row header for a cell first: the header unmounts with the row (no drop to <body>)
        focusCell(Math.max(0, viewRows.indexOf(row)))
        taskMut.remove([row.task.id])
      },
      openRow: () => {
        const row = selectedRow()
        if (row && isTaskViewRow(row)) openTask(row.task.id)
      },
      selectRow: () => {
        const f = store.get().focus
        const row = f ? viewRows[f.r] : undefined
        if (!f || !row) return
        store.set({ rowSelection: row.key, hasSelection: false })
        gridRef.current
          ?.element()
          ?.querySelector<HTMLElement>(`[data-row-header][data-r="${f.r}"]`)
          ?.focus({ preventScroll: true })
      },
      // M7-D11: Mod+↓ on a week cell expands it; the same index is then its first day column (same row)
      expandWeek: () => {
        const f = store.get().focus
        const col = f ? cols[f.c] : undefined
        if (!f || !col || zoom === 'DAY' || col.role !== 'week') return
        refocus.current = { r: f.r, week: col.weekStart, at: 'firstDay' }
        exp.expand(col.weekStart)
      },
      // Mod+↑ on a day / รวม cell collapses the view and focuses the week cell
      collapseWeek: () => {
        const f = store.get().focus
        const col = f ? cols[f.c] : undefined
        if (!f || !col || zoom === 'DAY' || col.role === 'week') return
        refocus.current = { r: f.r, week: col.weekStart, at: 'week' }
        exp.collapse(col.weekStart)
      },
      cellMenu: () => {
        const f = store.get().focus
        const row = f ? cellRows[f.r] : undefined
        const col = f ? cols[f.c] : undefined
        if (!f || !row || !col) return
        setMenu({ anchor: { rowKey: row.key, periodKey: col.key }, targets: selectionDayTargets(), col: f.c })
      },
      // M7.1-D17: the same targets as the task list (M3); archived / read-only grids and assignee rows: no-op
      rowMovable: () => {
        const row = selectedRow()
        return canReorder && row !== undefined && isTaskViewRow(row) && row.kind !== 'assignee'
      },
      moveRow: (dir) => {
        const row = selectedRow()
        if (!canReorder || !row || !isTaskViewRow(row) || row.kind === 'assignee') return
        moveRowBy(row.task.id, dir)
      },
    }
  })
  const gridKeyDown = useGridKeyboard(acc, editing, handlers)
  /** M7.1 (FR-819, X07): Shift+F10 / ContextMenu on a focused column header (its toggle) → the header menu. */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const header = (e.target as HTMLElement).closest<HTMLElement>('[role="columnheader"][data-c]')
    if (header && ((e.code === 'F10' && e.shiftKey) || e.code === 'ContextMenu')) {
      if (!canEdit || !markersEnabled) return
      e.preventDefault()
      const r = header.getBoundingClientRect()
      setMenu({
        anchor: { x: r.left + r.width / 2, y: r.bottom },
        targets: [],
        col: Number(header.dataset.c),
        header: true,
      })
      return
    }
    gridKeyDown(e)
  }

  const onSelectRow = useCallback(
    (r: number) => {
      const row = viewRows[r]
      if (!row) return
      store.set({
        rowSelection: row.key,
        hasSelection: false,
        active: true,
        focus: { r, c: store.get().focus?.c ?? store.get().home.c },
      })
    },
    [store, viewRows],
  )
  const onToggle = useCallback(
    (taskId: string) =>
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(taskId)) next.delete(taskId)
        else next.add(taskId)
        return next
      }),
    [],
  )
  const onUnassign = useCallback(
    (taskAssignmentId: string, name: string) => {
      const r = viewRows.findIndex(
        (x) =>
          (x.kind === 'merged' || x.kind === 'assignee') && x.assignee.taskAssignmentId === taskAssignmentId,
      )
      if (r >= 0) focusCell(r) // the × button unmounts with its row
      taskMut.unassign([taskAssignmentId], name)
    },
    [taskMut, viewRows, focusCell],
  )

  // ── "+ คน" (M6-D19, §8.9): one picker keyed by task id, outliving the row re-key that each pick causes ──
  const [addPersonTask, setAddPersonTask] = useState<string | null>(null)
  const refocusTask = useRef<string | null>(null)
  const rowsRef = useRef(viewRows)
  useLayoutEffect(() => {
    rowsRef.current = viewRows
  })
  const taskRowIndex = useCallback(
    (taskId: string) =>
      rowsRef.current.findIndex((x) => isTaskViewRow(x) && x.kind !== 'assignee' && x.task.id === taskId),
    [],
  )
  const addPersonAnchor = useCallback((): Element | null => {
    const root = gridRef.current?.element() ?? null
    const row = addPersonTask === null ? undefined : rowsRef.current[taskRowIndex(addPersonTask)]
    const header = row
      ? root?.querySelector<HTMLElement>(`[data-row-header][data-row-key="${row.key}"]`)
      : null
    return header?.querySelector('[data-add-person]') ?? header ?? root
  }, [addPersonTask, taskRowIndex])
  const closeAddPerson = useCallback(() => {
    if (addPersonTask === null) return
    refocusTask.current = addPersonTask
    setAddPersonTask(null)
  }, [addPersonTask])
  // after the popover (and its focus trap) closed: focus a cell of the task's current row, never <body>
  useEffect(() => {
    const taskId = refocusTask.current
    if (addPersonTask !== null || taskId === null) return
    refocusTask.current = null
    const el = gridRef.current?.element()
    const r = taskRowIndex(taskId)
    if (r < 0) {
      el?.focus({ preventScroll: true })
      return
    }
    focusCell(r)
    // GridCell focuses itself when its focus flag changes; same position as before → focus its node here
    const c = store.get().focus?.c
    el?.querySelector<HTMLElement>(`[data-cell][data-r="${r}"][data-c="${c}"]`)?.focus({
      preventScroll: true,
    })
  }, [addPersonTask, taskRowIndex, focusCell, store])

  /** Shift+click on a week header: that column over every editable row (M6-D33). */
  const onSelectColumn = useCallback(
    (c: number) => {
      const t = acc.current?.target
      if (!t) return
      let first = -1
      let last = -1
      for (let r = 0; r < viewRows.length; r++) {
        if (t(r, c)?.editability === 'ok') {
          if (first < 0) first = r
          last = r
        }
      }
      if (first < 0) return
      store.set({
        anchor: { r: first, c },
        focus: { r: last, c },
        hasSelection: true,
        rowSelection: null,
        active: true,
        mode: 'nav',
      })
    },
    [store, viewRows.length],
  )

  const onEditorBlur = useCallback(
    (value: string) => {
      if (store.get().mode !== 'edit') return
      if (!editing.commit(value, 'none')) editing.cancel()
    },
    [store, editing],
  )

  /** Flush on grid blur (focus leaves the root), §7.4. */
  const onBlur = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      const next = e.relatedTarget as Node | null
      if (next && e.currentTarget.contains(next)) return
      store.set({ active: false })
      void save.flush()
    },
    [store, save],
  )

  // ── initial scroll + perf marks (M6-D15, M6-D22); history return → the remembered place (FR-686) ──
  // undefined = not decided yet; null = open at the default week; a value = back from /t via ← / Esc / browser back
  const restore = useRef<BoxScroll | null | undefined>(undefined)
  // once per `today` (M7: expansions change the column indexes; they keep their own position, S3.11)
  const scrolledFor = useRef<string | null>(null)
  // M7.1 review (SPEC §7): the open column is held by key until the grid settles — the first scrollToColumn could be
  // lost (scroller not laid out yet / re-measured when the frozen widths, day columns or first data arrive) and the
  // grid then sat at the timeline start. Released by any user input or any scroll elsewhere (initialHoldStep).
  const colsRef = useRef(cols)
  const hasDataRef = useRef(false)
  useLayoutEffect(() => {
    colsRef.current = cols
    hasDataRef.current = model !== null
  })
  const hold = useRef<{ check: () => void; release: () => void } | null>(null)
  useLayoutEffect(() => hold.current?.check()) // after every commit: new columns / widths / data
  useLayoutEffect(() => {
    if (scrolledFor.current === today) return
    const el = gridRef.current?.element()
    // hidden (display:none) or not laid out yet: gridWidth re-runs this once VirtualGrid has measured a width
    if (!el || el.clientWidth === 0) return
    scrolledFor.current = today
    if (restore.current === undefined) {
      const pos = takeBoxScroll(currentScrollKey())
      restore.current = consumePopNavigation() ? pos : null
    }
    const back = restore.current
    if (back) {
      el.scrollTo({ left: back.left })
      return
    }
    // a narrow grid (phone) that cannot show the 4 weeks of history still opens with this week in view (SPEC §7)
    const fit = gridRef.current?.fittingColumns() ?? 0
    // M9-D28: a focus week (?week=) is opened as the first column as it is
    const start =
      focusIdx < 0 && fit > 0 && todayIdx >= 0 ? Math.max(initialIdx, todayIdx - fit + 1) : initialIdx
    gridRef.current?.scrollToColumn(start)
    const opened = colsRef.current[start]?.key
    if (!opened) return
    const key: string = opened
    const node: HTMLDivElement = el
    hold.current?.release()
    const t0 = performance.now()
    let seen = el.scrollLeft
    let busy = false
    let raf = 0
    const release = () => {
      if (hold.current !== h) return
      hold.current = null
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      node.removeEventListener('scroll', check)
      for (const ev of HOLD_INPUTS) window.removeEventListener(ev, release, true)
    }
    function check() {
      if (busy || hold.current !== h || node.clientWidth === 0) return
      const target = initialColumnLeft(colsRef.current, key, node.scrollWidth, node.clientWidth)
      const step = initialHoldStep({ left: node.scrollLeft, seen, want: target?.left ?? null })
      if (step === 'release') return release()
      if (step === 'correct' && target) {
        busy = true
        gridRef.current?.scrollToColumn(target.index)
        busy = false
      }
      seen = node.scrollLeft
      if (hasDataRef.current && performance.now() - t0 >= INITIAL_HOLD_SETTLE_MS) release()
    }
    const h = { check, release }
    hold.current = h
    const timer = setTimeout(release, INITIAL_HOLD_MAX_MS)
    el.addEventListener('scroll', check, { passive: true })
    for (const ev of HOLD_INPUTS) window.addEventListener(ev, release, { capture: true, passive: true })
    raf = requestAnimationFrame(check) // once the browser has laid the frame out
    // still holding when this re-runs (a new width / column set while settling) or unmounts (StrictMode's simulated
    // unmount included): release and open again on the next run; once released, a re-run never moves the grid
    return () => {
      if (hold.current !== h) return
      release()
      scrolledFor.current = null
    }
  }, [initialIdx, focusIdx, todayIdx, today, gridWidth])
  const hasData = model !== null
  useLayoutEffect(() => {
    const back = restore.current
    if (!hasData || !back) return
    // after the rows are laid out (the commit that rendered them); cleared only once applied (StrictMode re-runs)
    const raf = window.requestAnimationFrame(() => {
      restore.current = null
      gridRef.current?.element()?.scrollTo({ top: back.top, left: back.left })
      window.scrollTo({ top: back.windowY })
    })
    return () => window.cancelAnimationFrame(raf)
  }, [hasData])
  useEffect(() => {
    if (!hasData || typeof performance === 'undefined') return
    performance.mark('grid:first-data')
    const id = requestAnimationFrame(() => performance.mark('grid:painted'))
    return () => cancelAnimationFrame(id)
  }, [hasData])

  // ── tooltip content ──
  const msTip = gm.tooltipFor
  const tipData = useRef({ model, viewRows: cellRows, totals, projTotals, unit, view, cols, footerDays, footerWeeks, msTip })
  useLayoutEffect(() => {
    tipData.current = { model, viewRows: cellRows, totals, projTotals, unit, view, cols, footerDays, footerWeeks, msTip }
  })
  const contentFor = useCallback((el: HTMLElement): string[] | null => {
    const d = tipData.current
    if (!d.model) return null
    if (el.dataset.tip === 'milestone') return d.msTip(el)
    if (el.dataset.tip === 'header') {
      const t = el.dataset.date
        ? dayHeaderTooltipFor(d.model, el.dataset.date)
        : el.dataset.week
          ? headerTooltipFor(d.model, el.dataset.week)
          : null
      return t ? [t] : null
    }
    if (el.dataset.tip === 'footer') {
      const period = el.dataset.period ?? ''
      const w = d.footerWeeks.get(period)
      // M9 (S3.5): the person grid's week footer → excess + cause (ปิดใช้งาน from deactivatedOn, M9-D7)
      if (w && d.model.context.kind === 'person' && w.single && w.single.status.level !== 'OK') {
        const s = w.single
        const off = d.model.context.deactivatedOn
        const deactivated = off !== null && off <= period.slice(2)
        return [
          th.overload.footerStatus(th.overload.level[s.status.level], days1(s.load.total) || '0', days1(s.capCd) || '0'),
          th.overload.excess(twoDecimals(s.status.excessCd)),
          causeText(s.status.cause, deactivated),
        ]
      }
      const f = w ?? (period ? d.footerDays.get(period) : undefined)
      const names = f?.overPeople.map((u) => d.model?.people[u]?.name ?? '') ?? []
      return names.length > 0 ? [th.overload.peopleOver(names.join(', '))] : null
    }
    const row = d.viewRows[Number(el.dataset.r)]
    const col = d.cols[Number(el.dataset.c)]
    if (!row || !col) return null
    if (row.kind === 'project')
      return headerRowTooltipFor((d.projTotals.get(row.project.id) ?? row.project.totals)[col.key])
    if (row.kind === 'masked') return headerRowTooltipFor(row.masked.totals[col.key])
    const t = row.kind === 'task' ? d.totals.get(row.task.id)?.[col.key] : undefined
    return tooltipFor(row, col.key, d.model, { unit: d.unit, totalCd: t ? viewLoad(t, d.view) : 0 })
  }, [])
  const rootRef = useRef<HTMLDivElement>(null)

  // ── rendering ──
  const personOf = (row: CellRow) =>
    row.kind === 'merged' || row.kind === 'assignee' ? model?.people[row.assignee.userId] : undefined

  const renderRow = (i: number, vCols: readonly VirtualItem[], top: number, totalWidth: number) => {
    if (i === viewRows.length && !isPerson) {
      return (
        <div
          key="quick-add"
          role="row"
          aria-rowindex={HEADER_ROWS + i + 1}
          className={styles.quickAddRow}
          style={{ top, height: ROW_H, width: totalWidth }}
        >
          <div
            role="rowheader"
            aria-colindex={1}
            aria-colspan={FROZEN_COLS}
            className={styles.rowHeader}
            style={{ width: FROZEN_COL_W, height: ROW_H }}
          >
            {canEdit ? (
              <QuickAdd
                depth={0}
                disabled={false}
                inputRef={quickRef}
                inset={8}
                label={th.grid.row.addTaskLabel}
                onCreate={(name) => void taskMut.create({ parentId: null, name })}
                onEscape={() => {
                  // back to the row above the quick-add row (always rendered), scrolled into view (M6-D32)
                  if (viewRows.length > 0) focusCell(viewRows.length - 1)
                  else gridRef.current?.element()?.focus({ preventScroll: true })
                }}
              />
            ) : null}
          </div>
        </div>
      )
    }
    const vrow = viewRows[i]
    // the row whose cells this row shows (M7.1: a single-assignee sum row = its merged assignment row)
    const row = cellRows[i]
    if (!vrow || !row || !model) return null
    if (row.kind === 'project' || row.kind === 'masked') return renderHeaderRow(i, row, vCols, top, totalWidth)
    if (!isTaskViewRow(vrow)) return null
    const person = personOf(row)
    const personName = person?.name ?? null
    const rowName =
      row.kind === 'task' || vrow.kind === 'sum' ? row.task.name : `${row.task.name} · ${personName ?? ''}`
    const total: LoadPair | undefined =
      row.kind === 'task' ? rowTotals.get(row.task.id) : row.assignee.rowTotal
    return (
      <div
        key={vrow.key}
        role="row"
        aria-rowindex={HEADER_ROWS + i + 1}
        className={styles.row}
        style={{ top, height: ROW_H, width: totalWidth }}
        data-row-key={vrow.key}
        data-kind={vrow.kind}
        data-parent={vrow.task.hasChildren ? 'true' : undefined}
        data-tentative={row.task.certainty === 'TENTATIVE' ? 'true' : undefined}
        data-completed={row.task.completed ? 'true' : undefined}
        data-dragging={drag.state?.taskId === row.task.id ? 'true' : undefined}
      >
        <RowHeader
          store={store}
          r={i}
          row={vrow}
          height={ROW_H}
          personName={personName}
          personActive={person?.active ?? true}
          canEdit={canEdit}
          blockerNames={blockerNames.get(row.task.id) ?? EMPTY_NAMES}
          canAddPerson={picker !== null && !isPerson}
          addPersonOpen={addPersonTask === row.task.id}
          onAddPerson={setAddPersonTask}
          onSelectRow={onSelectRow}
          onOpenTask={openTask}
          onToggle={onToggle}
          onUnassign={onUnassign}
          showAssignees={showAssignees}
          draggable={canReorder && treeItems !== null}
          onDragHandle={drag.onHandlePointerDown}
          dragging={drag.state?.taskId === row.task.id}
          milestone={row.task.milestoneId === null ? null : (gm.byId.get(row.task.milestoneId) ?? null)}
          {...(isPerson ? { breadcrumb: row.task.breadcrumb ?? EMPTY_NAMES, onOpenInProject: openTask } : {})}
        />
        {vCols.map((v) => {
          const col = cols[v.index]
          if (!col) return null
          const cell = row.kind === 'task' ? undefined : model.cells.get(row.key)?.get(col.key)
          const cap = person?.capacity[col.key] ?? 0
          const marks = cellMarks(model, row, col.key)
          const isDay = col.kind === 'D'
          const taId = row.kind === 'task' ? null : row.assignee.taskAssignmentId
          const pendingCd =
            taId !== null && !isDay ? choice.pendingKeys.get(`${taId}|${col.weekStart}`) : undefined
          let text = ''
          let exact = ''
          if (row.kind === 'task') {
            const t = totals.get(row.task.id)?.[col.key]
            text = t ? days1(viewLoad(t, view)) : ''
          } else if (pendingCd !== undefined) {
            text = days1(pendingCd)
          } else if (cell) {
            const frac = unit === 'FRACTION' && cap > 0
            text = formatCd(cell.cd, { unit, baseCd: cap, decimals: unit === 'FRACTION' ? 2 : 1 })
            exact = frac
              ? formatCd(cell.cd, { unit: 'FRACTION', baseCd: cap, decimals: 2 })
              : formatCd(cell.cd, { unit: 'DAYS', decimals: 2 })
          }
          // M7 day cells (S3.4/S3.10): warnings, leave on that date, the person's day level
          const busy = isDay && !dayDates.has(col.weekStart)
          const warnLabel =
            isDay && cell?.warn?.includes('NON_WORKING')
              ? th.grid.warn.nonWorkingDay
              : !isDay && cell?.fallback
                ? th.grid.warn.weekNoCapacity
                : undefined
          const timeOffLabel =
            isDay && cell?.warn?.includes('TIME_OFF')
              ? th.grid.warn.allocatedOnTimeOff(formatCd(cell.cd, { unit: 'DAYS', decimals: 1 }))
              : undefined
          const status =
            isDay && row.kind !== 'task' && cell && cell.cd > 0
              ? personDayStatus(dayLoads.get(row.assignee.userId), person, col.key)
              : undefined
          const dayLevel = status && status.level !== 'OK' ? status.level : undefined
          const dayLevelLabel =
            status && dayLevel
              ? th.overload.dayStatus(
                  th.overload.level[dayLevel],
                  days1(status.load.total) || '0',
                  days1(status.capCd) || '0',
                )
              : undefined
          const parts = [
            text || (busy ? th.grid.day.loading : th.grid.cell.empty),
            !isDay && cell?.resolution === 'DAY' ? th.grid.glyph.dayDetail : null,
            marks.leave ? th.grid.glyph.leave : null,
            marks.noCapacity ? th.grid.glyph.noCapacity : null,
            marks.notCounted ? th.grid.cell.notCounted : null,
            marks.tentative ? th.grid.glyph.tentative : null,
            warnLabel ?? null,
            timeOffLabel ?? null,
            dayLevelLabel ?? null,
          ].filter((x): x is string => x !== null)
          const label = isDay
            ? `${rowName} ${th.grid.day.cellLabel(
                th.calendar.weekdaysLong[isoWeekday(col.date) - 1]!,
                formatWeekHeader(col.date),
                parts.join(' · '),
              )}`
            : col.role === 'weekTotal'
              ? th.grid.cell.label(
                  rowName,
                  th.grid.day.totalColumnLabel(formatWeekHeader(col.weekStart)),
                  parts.join(' · '),
                )
              : th.grid.cell.label(rowName, formatWeekHeader(col.weekStart), parts.join(' · '))
          const editability =
            vrow.kind === 'sum' ? cellEditability(vrow, cell, model) : cellEditability(row, cell, model)
          return (
            <GridCell
              key={v.key}
              store={store}
              r={i}
              c={v.index}
              left={v.start}
              width={v.size}
              rowKey={row.key}
              periodKey={col.key}
              text={text}
              label={label}
              editability={editability}
              resolution={cell?.resolution}
              tentative={marks.tentative}
              leave={marks.leave}
              noCapacity={marks.noCapacity}
              notCounted={marks.notCounted}
              today={isDay ? col.date === today : col.weekStart === thisWeek}
              exactValue={exact}
              onEditorBlur={onEditorBlur}
              colKind={col.kind}
              derived={isDay && cell?.derived === true}
              {...(isDay && cell?.derived ? { description: th.grid.day.derivedDescription } : {})}
              {...(warnLabel ? { warnLabel } : {})}
              {...(timeOffLabel ? { timeOffLabel } : {})}
              {...(dayLevel ? { dayLevel, dayLevelLabel: dayLevelLabel ?? '' } : {})}
              holiday={isDay && model.holidays.has(col.date)}
              pendingChoice={pendingCd !== undefined}
              busy={busy}
              collapsible={
                col.role === 'weekTotal' &&
                cell?.resolution === 'DAY' &&
                editability === 'ok' &&
                row.kind !== 'task'
              }
              onCollapse={onCollapseCell}
              monthStart={monthStarts.has(col.key)}
            />
          )
        })}
        <div
          role="gridcell"
          aria-colindex={totalColIndex(cols.length)}
          aria-readonly="true"
          className={styles.totalCell}
          style={{ width: TOTAL_COL_W, height: ROW_H }}
          data-testid={`cell-${row.key}-total`}
        >
          {total ? days1(rowTotalView(total, view)) : ''}
        </div>
      </div>
    )
  }

  /** M9 (S3.4): a person-grid project / masked row — read-only sums (days, 1 decimal), data-row-kind, no ↗. */
  const renderHeaderRow = (
    i: number,
    row: Extract<CellRow, { kind: 'project' | 'masked' }>,
    vCols: readonly VirtualItem[],
    top: number,
    totalWidth: number,
  ) => {
    if (!model) return null
    const name = row.kind === 'project' ? row.project.name : row.masked.label
    const loads = row.kind === 'project' ? (projTotals.get(row.project.id) ?? row.project.totals) : row.masked.totals
    const tentative = row.kind === 'project' && row.project.certainty === 'TENTATIVE'
    return (
      <div
        key={row.key}
        role="row"
        aria-rowindex={HEADER_ROWS + i + 1}
        className={styles.row}
        style={{ top, height: ROW_H, width: totalWidth }}
        data-row-key={row.key}
        data-kind={row.kind}
        data-tentative={tentative ? 'true' : undefined}
      >
        <PersonRowHeader
          store={store}
          r={i}
          row={row}
          height={ROW_H}
          onSelectRow={onSelectRow}
          onToggle={onToggle}
        />
        {vCols.map((v) => {
          const col = cols[v.index]
          if (!col) return null
          const load = loads[col.key]
          const text = load ? days1(viewLoad(load, view)) : ''
          const parts = [text || th.grid.cell.empty, tentative ? th.grid.glyph.tentative : null].filter(
            (x): x is string => x !== null,
          )
          const label =
            col.kind === 'D'
              ? `${name} ${th.grid.day.cellLabel(
                  th.calendar.weekdaysLong[isoWeekday(col.date) - 1]!,
                  formatWeekHeader(col.date),
                  parts.join(' · '),
                )}`
              : th.grid.cell.label(name, formatWeekHeader(col.weekStart), parts.join(' · '))
          return (
            <GridCell
              key={v.key}
              store={store}
              r={i}
              c={v.index}
              left={v.start}
              width={v.size}
              rowKey={row.key}
              periodKey={col.key}
              text={text}
              label={label}
              editability="readOnlyRow"
              resolution={undefined}
              tentative={tentative}
              leave={false}
              noCapacity={false}
              notCounted={false}
              today={col.kind === 'D' ? col.date === today : col.weekStart === thisWeek}
              exactValue=""
              onEditorBlur={onEditorBlur}
              colKind={col.kind}
              holiday={col.kind === 'D' && model.holidays.has(col.date)}
              monthStart={monthStarts.has(col.key)}
              rowKind={row.kind}
            />
          )
        })}
        <div
          role="gridcell"
          aria-colindex={totalColIndex(cols.length)}
          aria-readonly="true"
          className={styles.totalCell}
          style={{ width: TOTAL_COL_W, height: ROW_H }}
          data-testid={`cell-${row.key}-total`}
        />
        {/* empty: the server sends no timeline rowTotal for these rows, and a Σ of the loaded chunks would change
            while scrolling */}
      </div>
    )
  }

  const rowCount = model ? viewRows.length + (canAddTask ? 1 : 0) : 0
  const rowKeyAt = useCallback((i: number) => viewRows[i]?.key ?? 'quick-add', [viewRows])
  const message = chunks.isError
    ? null
    : !model
      ? th.grid.loading
      : viewRows.length === 0
        ? isPerson
          ? th.people.grid.empty
          : canEdit
            ? th.grid.empty
            : th.grid.emptyReadOnly
        : null

  // ── M7.1 chart pane (FR-813, M7.1-D3/D5): computed from the loaded chunks, x = the rendered weeks (4–26) ──
  const weeksForChart = useMemo(
    () =>
      rendered
        ? chartWeeks(cols, rendered.first, rendered.last)
        : chartWeeks(cols, initialIdx, initialIdx + 12),
    [cols, rendered, initialIdx],
  )
  const series = useMemo(
    () => (chartOpen && model ? memberLoadSeries(model, weeksForChart, { view, includeOthers, unit }) : []),
    [chartOpen, model, weeksForChart, view, includeOthers, unit],
  )

  // ── M7.1 resize handle (one element, re-rendered with the header) ──
  const frozen = frozenWidths(gridWidth, taskWidthPref, showAssignees)
  const resizeHandle = (
    <ColumnResizeHandle
      width={frozen.task}
      gridWidth={gridWidth}
      showAssignees={showAssignees}
      onLive={onTaskWidthLive}
      onCommit={onTaskWidthCommit}
      onSave={onTaskWidthSave}
      store={store}
    />
  )

  // M7.1: the cell menu = M7's ↕ item + "เพิ่มเส้นกำกับที่ขอบขวา"; on a column header only the marker item
  const onMenuCollapse = useCallback(() => {
    if (menu) collapseToWeek(menu.targets)
  }, [menu, collapseToWeek])
  const onMenuAddMarker = useCallback(() => {
    if (menu) addMarkerAtColumn(menu.col)
  }, [menu, addMarkerAtColumn])
  const menuItems = useMemo<CellMenuItem[] | undefined>(() => {
    if (!menu) return undefined
    const collapse: CellMenuItem = {
      id: 'collapseToWeek',
      label: menu.targets.length > 0 ? th.grid.day.collapseToWeek : th.grid.day.collapseToWeekDisabled,
      disabled: menu.targets.length === 0,
      onSelect: onMenuCollapse,
    }
    const add: CellMenuItem = {
      id: 'addMarker',
      label: canAddMarker ? th.planMarkers.addHere : th.planMarkers.limit(PLAN_MARKER_LIMIT),
      disabled: !canAddMarker || cols[menu.col] === undefined,
      onSelect: onMenuAddMarker,
    }
    const withMarker = canEdit && markersEnabled
    if (menu.header) return withMarker ? [add] : []
    return withMarker ? [collapse, add] : [collapse]
  }, [menu, canEdit, markersEnabled, canAddMarker, cols, onMenuCollapse, onMenuAddMarker])

  return (
    <div id={rootId} className={styles.root} ref={rootRef} data-chart-open={chartOpen ? 'true' : undefined}>
      <GridToolbar
        start={props.toolbarStart}
        view={view}
        unit={unit}
        showCompleted={showCompleted}
        saveState={save.state}
        onPrev={() => scrollToColumn((gridRef.current?.firstVisibleColumn() ?? initialIdx) - 4)}
        onNext={() => scrollToColumn((gridRef.current?.firstVisibleColumn() ?? initialIdx) + 4)}
        onToday={() => scrollToColumn(todayIdx)}
        zoom={zoom}
        onZoom={onZoom}
        onView={(v) => setPreference('load.view', v)}
        onUnit={(u) => setPreference('grid.unit', u)}
        onShowCompleted={(on) => setPreference('tasks.showCompleted', on)}
        showAssignees={showAssignees}
        {...(isPerson ? {} : { onShowAssignees: (on: boolean) => setShowAssignees(on) })}
        markers={
          markersEnabled ? (
            <MarkersMenu
              markers={planMarkers.markers}
              canEdit={canEdit}
              onGoTo={goToMarker}
              onAdd={() => {
                const date = defaultToolbarMarkerDate(today)
                const c = markerEdgeColumn(date, cols)
                if (c !== null) gridRef.current?.scrollToColumn(Math.max(0, c - 2))
                addMarker(date, document.querySelector('[data-testid="markers-menu"]'))
              }}
            />
          ) : null
        }
        chartOpen={chartOpen}
        {...(isPerson ? {} : { onChart })}
        {...(gm.canManage ? { onAddMilestone: (anchor: HTMLElement) => gm.openCreate(anchor) } : {})}
      />
      {archived ? (
        <Alert severity="info" sx={{ mb: 1 }}>
          {th.projects.archivedBanner}
        </Alert>
      ) : null}
      {chunks.isError ? (
        <Alert
          severity="error"
          sx={{ mb: 1 }}
          action={
            <Button color="inherit" size="small" onClick={chunks.refetch}>
              {th.grid.reload}
            </Button>
          }
        >
          {th.grid.loadError}
        </Alert>
      ) : null}
      <VirtualGrid
        ref={gridRef}
        label={props.label ?? th.grid.gridLabel(projectName)}
        saveState={save.state}
        cols={cols}
        rowCount={rowCount}
        rowKey={rowKeyAt}
        renderRow={renderRow}
        taskWidth={taskWidthPref}
        showAssignees={showAssignees}
        onWidthChange={setGridWidth}
        renderHeader={(vCols, totalWidth, view) => {
          const shown = renderedEdges(edges, vCols)
          const flags = renderedEdges(flagEdges, vCols)
          return (
            <div className={styles.headerGroup} style={{ width: totalWidth }} role="rowgroup">
              {gm.row(vCols, totalWidth)}
              <MonthHeader
                cols={cols}
                vCols={vCols}
                totalWidth={totalWidth}
                viewFrom={view?.from}
                viewTo={view?.to}
                renderFlags={
                  flags.length > 0
                    ? (span) => (
                        <MarkerFlags span={span} edges={flags} onOpen={openMarker} onOpenStack={openStack} />
                      )
                    : undefined
                }
              />
              <GridHeader
                cols={cols}
                vCols={vCols}
                totalWidth={totalWidth}
                thisWeek={thisWeek}
                holidayWeeks={holidayWeeks}
                onSelectColumn={onSelectColumn}
                today={today}
                holidays={model?.holidays ?? EMPTY_HOLIDAYS}
                toggle={zoom === 'WEEK'}
                onToggleWeek={onToggleWeek}
                showAssignees={showAssignees}
                onHideAssignees={() => setShowAssignees(false)}
                resizeHandle={resizeHandle}
                monthStarts={monthStarts}
                {...(openWeek ? { focusWeek: openWeek } : {})}
              />
              <MarkerLines piece="header" edges={shown} pad={paddingOf(cols, vCols)} />
            </div>
          )
        }}
        renderOverlay={(vCols, totalWidth, bodyHeight, frozenW) => (
          <>
            <MarkerLines
              piece="body"
              edges={renderedEdges(edges, vCols)}
              pad={frozenW}
              top={HEADER_TOTAL_H}
              height={bodyHeight}
            />
            {drag.state ? (
              <DropIndicator
                indicatorIndex={drag.state.indicatorIndex}
                depth={drag.state.depth}
                valid={drag.state.valid}
                width={totalWidth}
              />
            ) : null}
          </>
        )}
        renderFooter={(vCols, totalWidth, firstRowIndex) => (
          <Footer
            cols={cols}
            vCols={vCols}
            totalWidth={totalWidth}
            firstRowIndex={firstRowIndex}
            names={footerNames}
            cells={footer.cells}
            view={view}
            includeOthers={includeOthers}
            onIncludeOthers={setIncludeOthers}
            dayCells={footerDays}
            weekCells={footerWeeks}
            {...(isPerson ? { loadLabel: th.people.grid.footerLoad, showOthersSwitch: false } : {})}
            monthStarts={monthStarts}
            overlay={
              <MarkerLines piece="footer" edges={renderedEdges(edges, vCols)} pad={paddingOf(cols, vCols)} />
            }
          />
        )}
        message={message}
        onRangeChange={onRangeChange}
        onKeyDown={onKeyDown}
        onPointerDown={pointer.onPointerDown}
        onPointerMove={pointer.onPointerMove}
        onPointerUp={pointer.onPointerUp}
        onCopy={onCopy}
        onPaste={onPaste}
        onBlur={onBlur}
        onContextMenu={onContextMenu}
        subscribeTabStop={store.subscribe}
        onEnter={enterGrid}
      />
      {chartOpen ? (
        <div className={styles.chartPane} data-testid="chart-pane">
          <LoadChartPanel
            weeks={weeksForChart}
            series={series}
            unit={unit}
            view={view}
            includeOthers={includeOthers}
            onIncludeOthers={setIncludeOthers}
            markers={markerViews}
            today={today}
            loading={!model}
          />
        </div>
      ) : null}
      <AddPersonPopover
        taskId={canEdit && !isPerson ? addPersonTask : null}
        picker={picker}
        assignedUserIds={(addPersonTask && assignedByTask.get(addPersonTask)) || EMPTY_SET}
        anchor={addPersonAnchor}
        onClose={closeAddPerson}
      />
      <Br24Dialog
        open={choice.isOpen}
        pairs={choice.pairs}
        nameOf={(u) => model?.people[u]?.name ?? ''}
        ctxOf={(pair) => dayCtxFor(model?.people[pair.userId], pair.week)}
        onChoose={choice.choose}
        onCancel={choice.cancel}
      />
      <CellMenu
        anchor={menu?.anchor ?? null}
        targets={menu?.targets ?? EMPTY_TARGETS}
        onCollapse={() => collapseToWeek(menu?.targets ?? EMPTY_TARGETS)}
        onClose={closeMenu}
        {...(menuItems ? { items: menuItems } : {})}
      />
      <MarkerPopover
        marker={openedMarker ?? null}
        anchorEl={markerOpen?.anchor ?? null}
        editable={canEdit}
        onChange={planMarkers.update}
        onDelete={planMarkers.remove}
        onClose={() => setMarkerOpen(null)}
      />
      <Menu
        open={markerStack !== null}
        anchorEl={markerStack?.anchor ?? null}
        onClose={() => setMarkerStack(null)}
        slotProps={{ list: { 'aria-label': th.planMarkers.menu(markerStack?.edge.views.length ?? 0) } }}
      >
        {(markerStack?.edge.views ?? []).map((v) => (
          <MenuItem
            key={v.id}
            onClick={() => {
              const anchor = markerStack?.anchor ?? null
              setMarkerStack(null)
              if (anchor) setMarkerOpen({ id: v.id, anchor })
            }}
          >
            {markerName(v)}
          </MenuItem>
        ))}
      </Menu>
      <SumModeHint
        anchorEl={sumHint?.anchor ?? null}
        people={sumHint?.people ?? 0}
        onClose={closeSumHint}
        onShowAssignees={() => {
          const row = sumHint ? viewRows[sumHint.r] : undefined
          const c = sumHint?.c ?? 0
          setSumHint(null)
          setShowAssignees(true, row && isTaskViewRow(row) ? { taskId: row.task.id, c } : undefined)
        }}
      />
      {gm.overlays}
      <GridLegend />
      <CellTooltip rootRef={rootRef} contentFor={contentFor} />
    </div>
  )
}

/** Any of these ends the hold of the open column (the user took over). */
const HOLD_INPUTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
const EMPTY_SET: ReadonlySet<string> = new Set()
const EMPTY_HOLIDAYS: ReadonlyMap<string, string> = new Map()
const EMPTY_TARGETS: CollapseTarget[] = []
const EMPTY_NAMES: readonly string[] = []
const NO_ROWS: GridViewRow[] = []
const NO_PERSON_ROWS: PersonViewRow[] = []
