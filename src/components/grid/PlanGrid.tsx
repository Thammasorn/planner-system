'use client'
// src/components/grid/PlanGrid.tsx — the planning grid (SPEC §4.8, §7.4, §7.5, §8.3, §8.9; PLAN §3.10; plan/m06 S3).
// Thin orchestration: pure model in src/lib/grid/*, chunk queries (useGridChunks), save queue (useSaveAllocations),
// gestures (useGridEditing / useGridKeyboard / useGridClipboard / useFillHandle), undo (useGridUndo), rendering
// (VirtualGrid + GridCell + RowHeader + GridHeader + Footer). Task rows reuse M3's mutations (create, delete, assign,
// unassign) with their undo entries and toasts (M6-D19).
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import type { VirtualItem } from '@tanstack/react-virtual'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type JSX,
} from 'react'
import { viewLoad } from '@/domain/certainty'
import { addWeeks, weekStart } from '@/domain/dates'
import { formatCd } from '@/domain/units'
import type { Cd, LoadPair, PeriodKey } from '@/domain/types'
import { useProjectTasks } from '@/components/tasks/useProjectTasks'
import { QuickAdd } from '@/components/tasks/QuickAdd'
import { useTaskMutations } from '@/components/tasks/useTaskMutations'
import { useHotkeys } from '@/hooks/useHotkeys'
import { usePreferences } from '@/hooks/usePreferences'
import { useToday } from '@/hooks/useToday'
import { th } from '@/i18n/th'
import { formatWeekHeader } from '@/lib/format'
import { footerTotals, rowTotalView, taskRowTotals, taskTotals } from '@/lib/grid/aggregate'
import {
  buildColumns,
  chunksForRange,
  columnIndexOfPeriod,
  HEADER_ROWS,
  initialScrollIndex,
  NAME_W,
  ROW_H,
  timelineWeeks,
  TOTAL_W,
} from '@/lib/grid/columns'
import type { GridModel } from '@/lib/grid/merge'
import { buildViewRows, cellEditability, type ViewRow } from '@/lib/grid/rows'
import { targetGrid } from '@/lib/grid/targets'
import { cellMarks, headerTooltipFor, tooltipFor } from '@/lib/grid/tooltip'
import { rememberVersion } from '@/lib/grid/versions'
import type { GridCtx } from '@/lib/query-keys'
import { gridPreference, taskPreference } from '@/lib/schemas/preferences'
import { CellTooltip } from './CellTooltip'
import { Footer } from './Footer'
import { GridCell } from './GridCell'
import { GridHeader } from './GridHeader'
import { GridLegend, GridToolbar } from './GridToolbar'
import { AddPersonPopover, type PickerContext } from './AddPersonPopover'
import { createGridStore } from './gridStore'
import { RowHeader } from './RowHeader'
import { useFillHandle } from './useFillHandle'
import { useGridChunks } from './useGridChunks'
import { useGridClipboard } from './useGridClipboard'
import { useGridEditing, type GridAccess } from './useGridEditing'
import { useGridKeyboard, type GridKeyHandlers } from './useGridKeyboard'
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
  onOpenTask(taskId: string, projectId?: string): void
}

const EMPTY_TOTALS = new Map<string, Partial<Record<PeriodKey, LoadPair>>>()
const EMPTY_ROW_TOTALS = new Map<string, LoadPair>()
const days1 = (cd: Cd) => formatCd(cd, { unit: 'DAYS', decimals: 1 })
const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

export function PlanGrid(props: PlanGridProps): JSX.Element {
  const { context, projectName } = props
  const today = useToday()
  const thisWeek = weekStart(today)
  const { prefs, setPreference } = usePreferences()
  const unit = gridPreference(prefs, 'grid.unit')
  const view = gridPreference(prefs, 'load.view')
  const showCompleted = taskPreference(prefs, 'tasks.showCompleted')
  const [includeOthers, setIncludeOthers] = useState(false)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  // ── columns + chunks (FR-801, M6-D15) ──
  const cols = useMemo(() => buildColumns(timelineWeeks(today), new Set(), new Map()), [today])
  const initialIdx = useMemo(() => Math.max(0, initialScrollIndex(cols, today)), [cols, today])
  const todayIdx = useMemo(() => columnIndexOfPeriod(cols, `W:${thisWeek}`), [cols, thisWeek])
  const [chunkStarts, setChunkStarts] = useState(() =>
    chunksForRange(today, addWeeks(thisWeek, -4), addWeeks(thisWeek, 16)),
  )
  const onRangeChange = useCallback(
    (first: number, last: number) => {
      const a = cols[first]
      const b = cols[last]
      if (!a || !b) return
      const next = chunksForRange(today, a.weekStart, b.weekStart)
      setChunkStarts((prev) => (sameList(prev, next) ? prev : next))
    },
    [cols, today],
  )
  const chunks = useGridChunks(context, chunkStarts, includeOthers)
  const raw = chunks.model
  const archived = props.archived || (raw?.context.archived ?? false)
  const model = useMemo<GridModel | null>(() => {
    if (!raw) return null
    const canEdit = raw.context.canEdit && props.canEdit && !archived
    return canEdit === raw.context.canEdit && archived === raw.context.archived
      ? raw
      : { ...raw, context: { ...raw.context, canEdit, archived } }
  }, [raw, props.canEdit, archived])
  const canEdit = model ? model.context.canEdit : props.canEdit && !archived

  useEffect(() => {
    for (const r of model?.rows ?? [])
      if (r.kind === 'assignee') rememberVersion(r.taskAssignmentId, r.version)
  }, [model])

  // ── derived rows / sums (FR-805/806/809) ──
  const viewRows = useMemo(
    () => (model ? buildViewRows(model, { showCompleted, collapsed }) : []),
    [model, showCompleted, collapsed],
  )
  const totals = useMemo(() => (model ? taskTotals(model, viewRows) : EMPTY_TOTALS), [model, viewRows])
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

  // ── M3 task data: blocker names (M6-D31), picker members, task mutations (M6-D19) ──
  const tasksQ = useProjectTasks(context.id)
  const taskMut = useTaskMutations(context.id)
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
  const save = useSaveAllocations(context)
  const { gesture, undo, redo } = useGridUndo(context, save)
  const gridRef = useRef<VirtualGridHandle>(null)
  const quickRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    store.set({ home: { r: 0, c: Math.max(0, todayIdx) } })
  }, [store, todayIdx])

  const acc = useRef<GridAccess | null>(null)
  useLayoutEffect(() => {
    acc.current = {
      store,
      rowCount: viewRows.length,
      colCount: cols.length,
      target: model ? targetGrid(model, viewRows, cols, totals) : () => null,
      unit,
      gesture,
      scrollTo: (r, c) => gridRef.current?.scrollToCell(r, c),
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
  useHotkeys([{ hotkey: { code: 'KeyN' }, handler: focusQuickAdd }], { enabled: canEdit })

  const handlers = useRef<GridKeyHandlers | null>(null)
  useLayoutEffect(() => {
    const selectedRow = () => viewRows.find((r) => r.key === store.get().rowSelection)
    handlers.current = {
      undo: () => void undo(),
      redo: () => void redo(),
      flush: () => void save.flush(),
      newTask: focusQuickAdd,
      rowDeletable: () => {
        const row = selectedRow()
        return canEdit && row !== undefined && row.kind !== 'assignee'
      },
      deleteRow: () => {
        const row = selectedRow()
        if (!canEdit || !row || row.kind === 'assignee') return
        // focus leaves the row header for a cell first: the header unmounts with the row (no drop to <body>)
        focusCell(Math.max(0, viewRows.indexOf(row)))
        taskMut.remove([row.task.id])
      },
      openRow: () => {
        const row = selectedRow()
        if (row) props.onOpenTask(row.task.id)
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
    }
  })
  const onKeyDown = useGridKeyboard(acc, editing, handlers)

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
        (x) => x.kind !== 'task' && x.assignee.taskAssignmentId === taskAssignmentId,
      )
      if (r >= 0) focusCell(r) // the × button unmounts with its row
      taskMut.unassign([taskAssignmentId], name)
    },
    [taskMut, viewRows, focusCell],
  )
  const openTask = useCallback((taskId: string) => props.onOpenTask(taskId), [props])

  // ── "+ คน" (M6-D19, §8.9): one picker keyed by task id, outliving the row re-key that each pick causes ──
  const [addPersonTask, setAddPersonTask] = useState<string | null>(null)
  const refocusTask = useRef<string | null>(null)
  const rowsRef = useRef(viewRows)
  useLayoutEffect(() => {
    rowsRef.current = viewRows
  })
  const taskRowIndex = useCallback(
    (taskId: string) => rowsRef.current.findIndex((x) => x.kind !== 'assignee' && x.task.id === taskId),
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
    el?.querySelector<HTMLElement>(`[data-cell][data-r="${r}"][data-c="${c}"]`)?.focus({ preventScroll: true })
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

  // ── initial scroll + perf marks (M6-D15, M6-D22) ──
  useLayoutEffect(() => {
    gridRef.current?.scrollToColumn(initialIdx)
  }, [initialIdx])
  const hasData = model !== null
  useEffect(() => {
    if (!hasData || typeof performance === 'undefined') return
    performance.mark('grid:first-data')
    const id = requestAnimationFrame(() => performance.mark('grid:painted'))
    return () => cancelAnimationFrame(id)
  }, [hasData])

  // ── tooltip content ──
  const tipData = useRef({ model, viewRows, totals, unit, view, cols })
  useLayoutEffect(() => {
    tipData.current = { model, viewRows, totals, unit, view, cols }
  })
  const contentFor = useCallback((el: HTMLElement): string[] | null => {
    const d = tipData.current
    if (!d.model) return null
    if (el.dataset.tip === 'header') {
      const t = el.dataset.week ? headerTooltipFor(d.model, el.dataset.week) : null
      return t ? [t] : null
    }
    const row = d.viewRows[Number(el.dataset.r)]
    const col = d.cols[Number(el.dataset.c)]
    if (!row || !col) return null
    const t = row.kind === 'task' ? d.totals.get(row.task.id)?.[col.key] : undefined
    return tooltipFor(row, col.key, d.model, { unit: d.unit, totalCd: t ? viewLoad(t, d.view) : 0 })
  }, [])
  const rootRef = useRef<HTMLDivElement>(null)

  // ── rendering ──
  const personOf = (row: ViewRow) => (row.kind === 'task' ? undefined : model?.people[row.assignee.userId])

  const renderRow = (i: number, vCols: readonly VirtualItem[], top: number, totalWidth: number) => {
    if (i === viewRows.length) {
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
            className={styles.rowHeader}
            style={{ width: NAME_W, height: ROW_H }}
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
    const row = viewRows[i]
    if (!row || !model) return null
    const person = personOf(row)
    const personName = person?.name ?? null
    const rowName = row.kind === 'task' ? row.task.name : `${row.task.name} · ${personName ?? ''}`
    const total: LoadPair | undefined =
      row.kind === 'task' ? rowTotals.get(row.task.id) : row.assignee.rowTotal
    return (
      <div
        key={row.key}
        role="row"
        aria-rowindex={HEADER_ROWS + i + 1}
        className={styles.row}
        style={{ top, height: ROW_H, width: totalWidth }}
        data-row-key={row.key}
        data-kind={row.kind}
        data-tentative={row.task.certainty === 'TENTATIVE' ? 'true' : undefined}
        data-completed={row.task.completed ? 'true' : undefined}
      >
        <RowHeader
          store={store}
          r={i}
          row={row}
          height={ROW_H}
          personName={personName}
          personActive={person?.active ?? true}
          canEdit={canEdit}
          blockerNames={blockerNames.get(row.task.id) ?? EMPTY_NAMES}
          canAddPerson={picker !== null}
          addPersonOpen={addPersonTask === row.task.id}
          onAddPerson={setAddPersonTask}
          onSelectRow={onSelectRow}
          onOpenTask={openTask}
          onToggle={onToggle}
          onUnassign={onUnassign}
        />
        {vCols.map((v) => {
          const col = cols[v.index]
          if (!col) return null
          const cell = row.kind === 'task' ? undefined : model.cells.get(row.key)?.get(col.key)
          const cap = person?.capacity[col.key] ?? 0
          const marks = cellMarks(model, row, col.key)
          let text = ''
          let exact = ''
          if (row.kind === 'task') {
            const t = totals.get(row.task.id)?.[col.key]
            text = t ? days1(viewLoad(t, view)) : ''
          } else if (cell) {
            const frac = unit === 'FRACTION' && cap > 0
            text = formatCd(cell.cd, { unit, baseCd: cap, decimals: unit === 'FRACTION' ? 2 : 1 })
            exact = frac
              ? formatCd(cell.cd, { unit: 'FRACTION', baseCd: cap, decimals: 2 })
              : formatCd(cell.cd, { unit: 'DAYS', decimals: 2 })
          }
          const parts = [
            text || th.grid.cell.empty,
            cell?.resolution === 'DAY' ? th.grid.glyph.dayDetail : null,
            marks.leave ? th.grid.glyph.leave : null,
            marks.noCapacity ? th.grid.glyph.noCapacity : null,
            marks.notCounted ? th.grid.cell.notCounted : null,
            marks.tentative ? th.grid.glyph.tentative : null,
          ].filter((x): x is string => x !== null)
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
              label={th.grid.cell.label(rowName, formatWeekHeader(col.weekStart), parts.join(' · '))}
              editability={cellEditability(row, cell, model)}
              resolution={cell?.resolution}
              tentative={marks.tentative}
              leave={marks.leave}
              noCapacity={marks.noCapacity}
              notCounted={marks.notCounted}
              today={col.weekStart === thisWeek}
              exactValue={exact}
              onEditorBlur={onEditorBlur}
            />
          )
        })}
        <div
          role="gridcell"
          aria-colindex={cols.length + 2}
          aria-readonly="true"
          className={styles.totalCell}
          style={{ width: TOTAL_W, height: ROW_H }}
          data-testid={`cell-${row.key}-total`}
        >
          {total ? days1(rowTotalView(total, view)) : ''}
        </div>
      </div>
    )
  }

  const rowCount = model ? viewRows.length + (canEdit ? 1 : 0) : 0
  const rowKeyAt = useCallback((i: number) => viewRows[i]?.key ?? 'quick-add', [viewRows])
  const message = chunks.isError
    ? null
    : !model
      ? th.grid.loading
      : viewRows.length === 0
        ? canEdit
          ? th.grid.empty
          : th.grid.emptyReadOnly
        : null

  return (
    <div className={styles.root} ref={rootRef}>
      <GridToolbar
        view={view}
        unit={unit}
        showCompleted={showCompleted}
        saveState={save.state}
        onPrev={() => scrollToColumn((gridRef.current?.firstVisibleColumn() ?? initialIdx) - 4)}
        onNext={() => scrollToColumn((gridRef.current?.firstVisibleColumn() ?? initialIdx) + 4)}
        onToday={() => scrollToColumn(todayIdx)}
        onView={(v) => setPreference('load.view', v)}
        onUnit={(u) => setPreference('grid.unit', u)}
        onShowCompleted={(on) => setPreference('tasks.showCompleted', on)}
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
        label={th.grid.gridLabel(projectName)}
        saveState={save.state}
        cols={cols}
        rowCount={rowCount}
        rowKey={rowKeyAt}
        renderRow={renderRow}
        renderHeader={(vCols, totalWidth) => (
          <GridHeader
            cols={cols}
            vCols={vCols}
            totalWidth={totalWidth}
            thisWeek={thisWeek}
            holidayWeeks={holidayWeeks}
            onSelectColumn={onSelectColumn}
          />
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
        subscribeTabStop={store.subscribe}
        onEnter={enterGrid}
      />
      <AddPersonPopover
        taskId={canEdit ? addPersonTask : null}
        picker={picker}
        assignedUserIds={(addPersonTask && assignedByTask.get(addPersonTask)) || EMPTY_SET}
        anchor={addPersonAnchor}
        onClose={closeAddPerson}
      />
      <GridLegend />
      <CellTooltip rootRef={rootRef} contentFor={contentFor} />
    </div>
  )
}

const EMPTY_SET: ReadonlySet<string> = new Set()
const EMPTY_NAMES: readonly string[] = []
