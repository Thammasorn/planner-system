'use client'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { toast } from 'sonner'
import { EmptyState } from '@/components/common/EmptyState'
import { UserName } from '@/components/common/UserName'
import { MilestoneStatusChip } from '@/components/milestones/MilestoneStatusChip'
import { useMilestoneMutations } from '@/components/milestones/useMilestoneMutations'
import { SortableTree, type TreeRowState } from '@/components/tree/SortableTree'
import { milestoneStatus } from '@/domain/milestone'
import { useHotkeys } from '@/hooks/useHotkeys'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { usePreferences } from '@/hooks/usePreferences'
import { useToday } from '@/hooks/useToday'
import { th } from '@/i18n/th'
import type { MilestoneRef } from '@/lib/contracts/milestones'
import type { PersonOption } from '@/lib/contracts/people'
import type { ProjectTasksResponse, TaskDTO } from '@/lib/contracts/tasks'
import { formatThaiDate } from '@/lib/format'
import { HOTKEYS, matchesHotkey } from '@/lib/keys'
import { rememberScroll } from '@/lib/nav/scroll-memory'
import { taskPageHref } from '@/lib/nav/task-href'
import { useScrollRestore } from '@/lib/nav/useScrollRestore'
import { taskPreference } from '@/lib/schemas/preferences'
import { taskCertainty } from '@/lib/tasks/certainty'
import { groupTasks, type TaskGroup } from '@/lib/tasks/group'
import { rangeSelect, toggleSelect, topLevelSelected } from '@/lib/tasks/selection'
import { sortRows, treeOpsEnabled } from '@/lib/tasks/sort'
import { buildTaskRows, unionAssigneeIds, visibleRows, type TaskRowModel } from '@/lib/tasks/tree'
import { TASK_MAX_DEPTH_INDEX } from '@/lib/tree/ops'
import { personOf } from './AssigneeChips'
import { BulkBar } from './BulkBar'
import { QuickAdd } from './QuickAdd'
import { StatusChip } from './status/StatusChip'
import { StatusMenu } from './status/StatusMenu'
import { openTaskPanel, useTaskParam } from './task-param'
import { TaskRow, type TaskRowActions } from './TaskRow'
import styles from './TaskRow.module.css'
import { errorMessage, resolveId, useTaskMutations } from './useTaskMutations'
import { useProjectTasks } from './useProjectTasks'

/**
 * M10-D9: options of the list when it is embedded in a page ("มุมมองงาน" live block). The block's `showDone` is folded
 * into `filter`; completed rows are otherwise kept. Preferences (group / sort / show completed) are ignored, tree ops,
 * the `N` hotkey, the bulk bar and the archived banner are off; Space and "เปิด" call `onOpenTask`.
 */
export interface TaskListEmbedOptions {
  /** Assignee / milestone / status / showDone of the block props. */
  filter: (t: TaskDTO) => boolean
  /** Max matching rows (ancestors shown as context rows do not count). */
  limit: number
  /** Replaces ?task= + TaskPanel (the block navigates to the project's tasks tab). */
  onOpenTask: (taskId: string) => void
  /** Lets EmbeddedTasks render "ดูทั้งหมด (n)": matches shown and matches in total. */
  onCount?: ((shown: number, total: number) => void) | undefined
}

export interface TaskListProps {
  projectId: string
  /** M10-D9: embedded in a page; absent = the M3 tasks tab. */
  embed?: TaskListEmbedOptions | undefined
}

/** Quick-add anchor (M3-D18): null = end of the root list; else a sibling `afterId` (undefined = append). */
type QuickAnchor = { parentId: string | null; afterId: string | null | undefined; depth: number } | null

/**
 * Keyboard-first outliner (FR-602–614, §8.6, M3-D18/19/22): `role="treegrid"` with roving focus; Enter opens quick
 * add below the row, Tab/Shift+Tab indent/outdent, Alt+↑/↓ move among siblings (M3-D10), Mod+Enter done, Delete,
 * Space panel, S status, Shift+F10 / ContextMenu row menu, arrows move focus (Shift extends the selection), ←/→
 * collapse/expand, F2 rename. Tree ops only ungrouped + manual order (X62). Read-only (archived): Tab leaves the list.
 */
export function TaskList({ projectId, embed }: TaskListProps) {
  const q = useProjectTasks(projectId)
  if (q.isPending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} aria-label={th.common.loading} />
      </Box>
    )
  }
  if (q.isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void q.refetch()}>
            {th.common.retry}
          </Button>
        }
      >
        {errorMessage(q.error)}
      </Alert>
    )
  }
  return <TaskListView projectId={projectId} data={q.data} embed={embed} />
}

type OrderItem = { key: string; row: TaskRowModel }

function TaskListView({
  projectId,
  data,
  embed,
}: {
  projectId: string
  data: ProjectTasksResponse
  embed: TaskListEmbedOptions | undefined
}) {
  const { prefs } = usePreferences()
  // M10-D9: an embedded list ignores the tab's view preferences (no grouping, manual order, completed rows kept)
  const groupBy = embed ? 'none' : taskPreference(prefs, 'tasks.groupBy')
  const sort = embed ? 'manual' : taskPreference(prefs, 'tasks.sort')
  const showCompleted = embed ? true : taskPreference(prefs, 'tasks.showCompleted')
  const m = useTaskMutations(projectId)
  const ms = useMilestoneMutations()
  const router = useRouter()
  useScrollRestore(!embed) // FR-686: back from /t lands where ↗ / Shift+Space left the list (the tab only)
  const people = usePeopleOptions()
  const peopleById = useMemo(
    () => new Map<string, PersonOption>((people.data ?? []).map((p) => [p.id, p])),
    [people.data],
  )
  const { canEdit, canManage } = data.viewer
  const ops = embed ? false : treeOpsEnabled(groupBy, sort, canEdit)
  const memberIds = useMemo(() => new Set(data.members.map((x) => x.userId)), [data.members])

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [quick, setQuick] = useState<QuickAnchor>(null)
  const [statusMenu, setStatusMenu] = useState<{ anchor: HTMLElement; ids: string[] } | null>(null)
  const quickRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const [focusQuickTick, setFocusQuickTick] = useState(0)
  const lastCreated = useRef<string | null>(null)
  // Opening the panel narrows the list, rows above re-wrap and the clicked row can slide out of view: keep the panel's
  // row visible (after the layout; `nearest` is a no-op when it is already on screen, e.g. after the scroll restore).
  const panelTaskId = useTaskParam()
  useEffect(() => {
    if (panelTaskId === null) return
    const raf = window.requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(panelTaskId)}"]`)
      el?.scrollIntoView({ block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(raf)
  }, [panelTaskId])

  const allRows = useMemo(() => buildTaskRows(data.tasks), [data.tasks])
  const byId = useMemo(() => new Map(allRows.map((r) => [r.id, r])), [allRows])
  const statusById = useMemo(() => new Map(data.statuses.map((s) => [s.id, s])), [data.statuses])
  const milestoneById = useMemo(
    () => new Map<string, MilestoneRef>(data.milestones.map((x) => [x.id, x])),
    [data.milestones],
  )
  // M10-D9/D6: embedded → the first `limit` matches (DFS order) plus their ancestors as context rows
  const embedFilter = embed?.filter
  const embedLimit = embed?.limit
  const embedCut = useMemo(() => {
    if (embedFilter === undefined || embedLimit === undefined) return null
    const matches = allRows.filter((r) => embedFilter(r))
    const shown = matches.slice(0, Math.max(0, embedLimit))
    const parentOf = new Map(allRows.map((r) => [r.id, r.parentId]))
    const matchIds = new Set(shown.map((r) => r.id))
    const keep = new Set<string>()
    for (const r of shown)
      for (let id: string | null = r.id; id !== null && !keep.has(id); id = parentOf.get(id) ?? null)
        keep.add(id)
    return {
      rows: allRows.filter((r) => keep.has(r.id)),
      matchIds,
      shown: shown.length,
      total: matches.length,
    }
  }, [allRows, embedFilter, embedLimit])
  const onCount = embed?.onCount
  useEffect(() => {
    if (embedCut) onCount?.(embedCut.shown, embedCut.total)
  }, [embedCut, onCount])
  const visible = useMemo(
    () => visibleRows(embedCut ? embedCut.rows : allRows, { collapsed, showCompleted }),
    [allRows, embedCut, collapsed, showCompleted],
  )
  const groups = useMemo<TaskGroup[]>(() => {
    const raw =
      groupBy === 'none'
        ? [{ key: 'all', kind: 'all' as const, rows: visible }]
        : groupTasks(visible, groupBy, {
            projectCertainty: data.project.certainty,
            displayName: (id) => personOf(peopleById, id).nickname ?? personOf(peopleById, id).name,
            statuses: data.statuses,
            milestones: data.milestones,
          })
    return raw.map((g) => ({ ...g, rows: sortRows(g.rows, sort) }))
  }, [groupBy, visible, data.project.certainty, data.statuses, data.milestones, peopleById, sort])
  const order = useMemo<OrderItem[]>(
    () => groups.flatMap((g) => g.rows.map((row) => ({ key: `${g.key}|${row.id}`, row }))),
    [groups],
  )
  const orderIds = useMemo(() => order.map((o) => o.row.id), [order])
  const activeKey = order.some((o) => o.key === focusKey) ? focusKey : (order[0]?.key ?? null)
  const blockerNames = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const e of data.blockerEdges) {
      const name = byId.get(e.blockerTaskId)?.name
      if (name === undefined) continue
      const list = out.get(e.taskId)
      if (list) list.push(name)
      else out.set(e.taskId, [name])
    }
    return out
  }, [data.blockerEdges, byId])
  const certaintyOf = (id: string) => taskCertainty(byId, id, data.project.certainty).value

  // Focus follows keyboard moves (after the render that created the row).
  useEffect(() => {
    const k = pendingFocus.current
    if (k === null) return
    pendingFocus.current = null
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(k)}"]`)
    el?.focus()
  })
  useEffect(() => {
    if (focusQuickTick > 0) quickRef.current?.focus()
  }, [focusQuickTick])

  const focusRow = (key: string) => {
    setFocusKey(key)
    pendingFocus.current = key
  }
  const focusQuick = (anchor: QuickAnchor) => {
    setQuick(anchor)
    setFocusQuickTick((n) => n + 1)
  }

  // N focuses quick add on the tasks tab (M3-D9); never while typing (X49).
  // M10-D9: never from a list embedded in a page (no global key capture from inside a document)
  useHotkeys([{ hotkey: { code: 'KeyN' }, handler: () => focusQuick(null) }], { enabled: canEdit && !embed })
  /** Space / "เปิด": the tab's panel (?task=), or the embed's navigation (M10-D9). */
  const openTask = (id: string) => (embed ? embed.onOpenTask(id) : openTaskPanel(id))

  // display order, each id once (a multi-assignee leaf appears in several assignee groups)
  const selectedIds = [...new Set(orderIds.filter((x) => selection.has(x)))]
  const targetIds = (id: string): string[] => (selection.has(id) ? selectedIds : [id])

  const toggleDone = (ids: string[]) => {
    const rows = ids.map((id) => byId.get(id)).filter((r): r is TaskRowModel => r !== undefined)
    if (rows.length === 0) return
    if (rows.every((r) => r.completedOn !== null)) m.uncomplete(rows.map((r) => r.id))
    else m.complete(rows.filter((r) => r.completedOn === null).map((r) => r.id))
  }
  const removeIds = (ids: string[]) => {
    const roots = topLevelSelected(allRows, new Set(ids))
    if (roots.length === 0) return
    setSelection(new Set())
    m.remove(roots)
  }
  /**
   * First row key from `fromKey` (default: the active row) on that survives deleting `ids` with their subtrees (else
   * the nearest before) — a parent's children and other selected rows go with the delete, so never focus them.
   */
  const survivorAfter = (ids: readonly string[], fromKey: string | null = activeKey): string | null => {
    const gone = new Set(ids)
    const removed = (id: string): boolean => {
      for (let p: string | null = id; p !== null; p = byId.get(p)?.parentId ?? null)
        if (gone.has(p)) return true
      return false
    }
    const idx = Math.max(
      0,
      order.findIndex((o) => o.key === fromKey),
    )
    const after = order.slice(idx).find((o) => !removed(o.row.id))
    const before = order
      .slice(0, idx)
      .reverse()
      .find((o) => !removed(o.row.id))
    return (after ?? before)?.key ?? null
  }
  const treeOp = (run: () => void) => {
    if (!canEdit) return
    if (!ops) {
      toast.info(th.tasks.treeOpsDisabled)
      return
    }
    run()
  }

  const actions: TaskRowActions = {
    select: (e: MouseEvent, key, id) => {
      setFocusKey(key)
      if (e.metaKey || e.ctrlKey) setSelection((s) => toggleSelect(s, id))
      else if (e.shiftKey && anchorId !== null) {
        setSelection(rangeSelect(orderIds, anchorId, id))
        return
      } else if (e.shiftKey) setSelection(new Set([id]))
      else {
        // M6.1-D17 (FR-685): a plain row click selects the row and opens the panel; modifiers only select (FR-614).
        // Embedded (M10-D9): select only — leaving the document needs Space or "เปิด".
        setSelection(new Set([id]))
        if (!embed) openTaskPanel(id)
      }
      setAnchorId(id)
    },
    toggleExpand: (id) => setCollapsed((c) => toggleSelect(c, id)),
    toggleDone: (id) => toggleDone([id]),
    rename: (id, name) => m.updateAsync(id, { name }),
    openStatus: (anchor, id) => setStatusMenu({ anchor, ids: targetIds(id) }),
    openPanel: (id) => openTask(id),
    openPage: (id) => openPage(id),
    unassign: (assignmentId, label) => m.unassign([assignmentId], label),
    addSubtask: (row) => {
      setCollapsed((c) => {
        const n = new Set(c)
        n.delete(row.id)
        return n
      })
      // grouped/sorted views have no inline position: the panel's "+ เพิ่มงานย่อย" takes over
      if (ops) focusQuick({ parentId: row.id, afterId: undefined, depth: row.depth + 1 })
      else openTask(row.id)
    },
    moveUp: (id) => treeOp(() => m.moveUp(id)),
    moveDown: (id) => treeOp(() => m.moveDown(id)),
    indent: (id) => treeOp(() => m.indent(id)),
    outdent: (id) => treeOp(() => m.outdent(id)),
    remove: (id) => removeIds(targetIds(id)),
    quickAddBelow: (row) => {
      if (!canEdit) return
      focusQuick(ops ? { parentId: row.parentId, afterId: row.id, depth: row.depth } : null)
    },
  }

  /** FR-685/686: Shift+Space and the row menu leave for /t/<id>; the list remembers where it was. */
  const openPage = (id: string) => {
    rememberScroll()
    router.push(taskPageHref(id))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.getAttribute('role') !== 'row') return
    const key = target.dataset.rowKey
    const id = target.dataset.taskId
    if (key === undefined || id === undefined) return
    const row = byId.get(id)
    const idx = order.findIndex((o) => o.key === key)
    const mod = e.metaKey || e.ctrlKey
    const step = (d: number) => {
      const next = order[idx + d]
      if (!next) return
      if (e.shiftKey) setSelection(rangeSelect(orderIds, anchorId ?? id, next.row.id))
      else if (anchorId === null) setAnchorId(id)
      focusRow(next.key)
    }
    if (matchesHotkey(e, HOTKEYS.openPage)) {
      e.preventDefault()
      openPage(id)
      return
    }
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      target.querySelector<HTMLElement>('[data-row-menu]')?.click()
      return
    }
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        if (e.altKey) {
          // keyboard alternative to dragging among siblings (M3-D10); the row keeps focus at its new place
          if (selection.size > 1) return
          treeOp(() => (e.key === 'ArrowUp' ? m.moveUp(id) : m.moveDown(id)))
          focusRow(key)
          return
        }
        step(e.key === 'ArrowDown' ? 1 : -1)
        return
      case 'ArrowLeft':
        if (row?.hasChildren && !collapsed.has(id)) {
          e.preventDefault()
          setCollapsed((c) => new Set([...c, id]))
        }
        return
      case 'ArrowRight':
        if (row?.hasChildren && collapsed.has(id)) {
          e.preventDefault()
          setCollapsed((c) => toggleSelect(c, id))
        }
        return
      case 'Tab':
        // read-only: no tree op exists, so Tab is the way out of the list (§8.9 — never trap focus)
        if (!canEdit) return
        e.preventDefault() // never let the browser move focus out of the list (R10)
        if (selection.size > 1) return
        treeOp(() => (e.shiftKey ? m.outdent(id) : m.indent(id)))
        return
      case 'Enter':
        e.preventDefault()
        if (mod) {
          if (canEdit) toggleDone(targetIds(id)) // archived: the checkbox is disabled, so is its shortcut
          return
        }
        if (row) actions.quickAddBelow(row)
        return
      case 'F2':
        e.preventDefault()
        target.querySelector<HTMLElement>('[data-inline-edit]')?.click()
        return
      case 'Delete':
      case 'Backspace':
        if (!canEdit) return
        e.preventDefault()
        {
          // the focused row unmounts with its subtree: keep the keyboard user's place on a row that survives
          const ids = targetIds(id)
          const next = survivorAfter(ids, key)
          removeIds(ids)
          if (next) focusRow(next)
        }
        return
      case ' ':
        e.preventDefault()
        openTask(id)
        return
      case 'Escape':
        // no preventDefault: the same Esc also closes the panel (§8.6)
        if (selection.size > 0) setSelection(new Set())
        return
    }
    if (e.code === 'KeyS' && !mod && !e.altKey && !e.shiftKey && canEdit) {
      e.preventDefault()
      const chip = target.querySelector<HTMLElement>('[data-status-id]') ?? target
      setStatusMenu({ anchor: chip, ids: targetIds(id) })
    }
  }

  // Quick add placement: after the last visible row of the anchor's block (where the new sibling will appear).
  const quickAfterId = useMemo(() => {
    if (quick === null || !ops) return null
    const anchorRowId = resolveId(quick.afterId ?? quick.parentId ?? '')
    const i = visible.findIndex((r) => r.id === anchorRowId)
    if (i < 0) return null
    const base = visible[i] as TaskRowModel
    let j = i
    while (j + 1 < visible.length && (visible[j + 1] as TaskRowModel).depth > base.depth) j++
    return (visible[j] as TaskRowModel).id
  }, [quick, ops, visible])

  const onCreate = (name: string) => {
    const a = quickAfterId !== null && quick ? quick : null
    const tmp = m.create(
      a
        ? { parentId: a.parentId, ...(a.afterId !== undefined ? { afterId: a.afterId } : {}), name }
        : { parentId: null, name },
    )
    lastCreated.current = tmp
    if (a) setQuick({ parentId: a.parentId, afterId: tmp, depth: a.depth })
  }
  const onQuickEscape = () => {
    setQuick(null)
    const last = lastCreated.current
    const k = last ? order.find((o) => o.row.id === resolveId(last))?.key : undefined
    if (k) focusRow(k)
    else if (activeKey) focusRow(activeKey)
  }
  const quickAdd = (inline: boolean, depth: number) => (
    <QuickAdd
      key={inline ? 'inline' : 'end'}
      depth={depth}
      disabled={!canEdit}
      inputRef={quickRef}
      onCreate={onCreate}
      onEscape={onQuickEscape}
      autoFocus={inline}
    />
  )

  const renderRow = (row: TaskRowModel, key: string, s?: TreeRowState) => {
    const context = embedCut !== null && !embedCut.matchIds.has(row.id)
    const node = renderRowNode(row, key, s)
    // M10-D9: an ancestor shown only for context is dimmed and marked (it is not one of the block's matches)
    return context ? (
      <div data-context-row="" aria-disabled="true" style={{ opacity: 0.6 }}>
        {node}
      </div>
    ) : (
      node
    )
  }
  const renderRowNode = (row: TaskRowModel, key: string, s?: TreeRowState) => (
    <>
      <TaskRow
        row={row}
        rowKey={key}
        depth={s?.depth ?? (groupBy === 'none' && sort === 'manual' ? row.depth : 0)}
        focused={key === activeKey}
        selected={selection.has(row.id)}
        expanded={!collapsed.has(row.id)}
        ops={ops}
        canEdit={canEdit}
        canManage={canManage}
        showPath={groupBy !== 'none' || sort !== 'manual'}
        status={statusById.get(row.statusId)}
        certainty={certaintyOf(row.id)}
        blockerNames={blockerNames.get(row.id) ?? []}
        unionUserIds={row.isLeaf ? [] : unionAssigneeIds(allRows, row.id)}
        people={peopleById}
        projectId={projectId}
        memberIds={memberIds}
        handleRef={s?.handleRef}
        handleProps={s?.handleProps}
        invalid={s?.invalid}
        milestone={row.milestoneId === null ? null : (milestoneById.get(row.milestoneId) ?? null)}
        actions={actions}
      />
      {quickAfterId === row.id && quick ? (
        // inside the treegrid every owned element is a row › gridcell (M3-D22): the inline field is a row of its own
        <div role="row" aria-level={quick.depth + 1} data-quick-add-row="">
          <div role="gridcell">{quickAdd(true, quick.depth)}</div>
        </div>
      ) : null}
    </>
  )

  const statusMenuCurrent =
    statusMenu && statusMenu.ids.length === 1
      ? (byId.get(statusMenu.ids[0] as string)?.statusId ?? null)
      : null
  const leafSelected = selectedIds.filter((id) => byId.get(id)?.isLeaf)

  return (
    <Box>
      {!canEdit && !embed ? (
        <Alert severity="info" sx={{ mb: 1 }}>
          {th.tasks.readOnlyArchived}
        </Alert>
      ) : null}
      <div
        ref={listRef}
        role="treegrid"
        aria-label={th.tasks.listLabel}
        aria-multiselectable="true"
        className={styles.list}
        onKeyDown={onKeyDown}
      >
        {groups.map((g) => (
          <div key={g.key} role="rowgroup">
            {g.kind !== 'all' ? (
              <GroupHeader group={g} data={data} people={peopleById} allRows={allRows} />
            ) : null}
            {g.kind === 'all' && sort === 'manual' ? (
              <SortableTree
                items={g.rows}
                fullItems={allRows}
                maxDepthIndex={TASK_MAX_DEPTH_INDEX}
                disabled={!ops}
                onMove={(mv) => m.move({ taskId: mv.id, parentId: mv.parentId, afterId: mv.afterId })}
                renderRow={(row, s) => renderRow(row, `${g.key}|${row.id}`, s)}
              />
            ) : (
              g.rows.map((row) => (
                <div key={`${g.key}|${row.id}`}>{renderRow(row, `${g.key}|${row.id}`)}</div>
              ))
            )}
          </div>
        ))}
      </div>
      {embedCut ? (
        embedCut.total === 0 ? (
          <EmptyState title={th.editor.liveBlocks.empty} />
        ) : null
      ) : data.tasks.length === 0 ? (
        <EmptyState title={th.tasks.empty} />
      ) : null}
      {canEdit && quickAfterId === null ? quickAdd(false, 0) : null}
      {selection.size >= 2 && !embed ? (
        <BulkBar
          count={selectedIds.length}
          statuses={data.statuses}
          canEdit={canEdit}
          canManage={canManage}
          memberIds={memberIds}
          onComplete={() => {
            const open = selectedIds.filter((id) => byId.get(id)?.completedOn === null)
            m.complete(open)
          }}
          onSetStatus={(statusId) => m.setStatus(selectedIds, statusId)}
          onAssign={(userId) => m.assign(leafSelected, userId)}
          milestones={data.milestones}
          onLinkMilestone={(ref) => void ms.link(projectId, selectedIds, ref, { toast: true })}
          onDelete={() => {
            // the bar unmounts with its focused button: keep the keyboard user's place in the list
            const next = survivorAfter(selectedIds)
            removeIds(selectedIds)
            if (next) focusRow(next)
          }}
          onClear={() => {
            setSelection(new Set())
            if (activeKey) focusRow(activeKey)
          }}
        />
      ) : null}
      <StatusMenu
        statuses={data.statuses}
        currentId={statusMenuCurrent}
        anchorEl={statusMenu?.anchor ?? null}
        onPick={(statusId) => statusMenu && m.setStatus(statusMenu.ids, statusId)}
        onClose={() => setStatusMenu(null)}
      />
    </Box>
  )
}

function GroupHeader({
  group,
  data,
  people,
  allRows,
}: {
  group: TaskGroup
  data: ProjectTasksResponse
  people: ReadonlyMap<string, PersonOption>
  /** Every live row (FR-703 progress counts all bound tasks, not only the visible ones). */
  allRows: readonly TaskRowModel[]
}) {
  const today = useToday()
  const count = <span className={styles.muted}>{th.my.countLabel(group.rows.length)}</span>
  let title: ReactNode = null
  if (group.kind === 'status') {
    const s = data.statuses.find((x) => x.id === group.statusId)
    title = s ? <StatusChip status={s} /> : null
  } else if (group.kind === 'assignee' && group.userId) {
    title = <UserName user={personOf(people, group.userId)} />
  } else if (group.kind === 'unassigned') {
    title = th.tasks.groups.unassigned
  } else if (group.kind === 'certainty') {
    title = group.certainty === 'TENTATIVE' ? th.tasks.groups.tentative : th.tasks.groups.confirmed
  } else if (group.kind === 'milestone') {
    const ref = data.milestones.find((x) => x.id === group.milestoneId)
    if (ref) {
      const bound = allRows.filter((r) => r.milestoneId === ref.id)
      const done = bound.filter((r) => r.completedOn !== null).length
      title = (
        <span className={styles.groupTitle}>
          <span>{th.milestones.tasks.groupHeader(ref.name, formatThaiDate(ref.date, 'medium'))}</span>
          <MilestoneStatusChip status={milestoneStatus(ref, today)} />
          <span className={styles.muted}>{th.milestones.progress(done, bound.length)}</span>
        </span>
      )
    }
  } else if (group.kind === 'noMilestone') {
    title = th.tasks.groups.noMilestone
  }
  return (
    <div role="row" className={styles.groupHeader} data-group={group.key}>
      <div role="columnheader">{title}</div>
      <div role="gridcell">{count}</div>
    </div>
  )
}
