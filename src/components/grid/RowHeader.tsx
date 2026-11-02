'use client'
// src/components/grid/RowHeader.tsx — the frozen part of one row (SPEC §8.3, FR-805/808/815/816, FR-643, FR-685,
// AC-203, M6-D18/D19/D31/D33, M6.1-D17, M7.1-D8). One role="rowheader" spanning the two frozen ARIA columns
// (aria-colspan 2) holds two visual cells:
// - TaskCell (--grid-task-w): ⠿ drag handle (M7.1, editable task rows only), indent by depth, ▸/▾ for parents, the task
//   name (… + title tooltip; click selects the row, double-click — or Enter on the selected row header, PlanGrid —
//   opens the panel), "👥 N" on summed rows, ◐ + "*" for tentative, ⛔ via M3's BlockerBadge, ↗ = a real link to
//   `/t/<id>` (hover / focus-within, always on touch), "+ คน" (hover and focus-within) opening PlanGrid's
//   AddPersonPopover (owned by PlanGrid so it survives the row re-keying t:<task> → a:<assignment> after the first pick).
// - AssigneeCell (--grid-assignee-w, absent when the column is hidden): the person via M1 UserName ("(ปิดใช้งาน)")
//   and × to unassign; empty on task rows.
// Keeping one rowheader keeps the roving tab stop, the row selection and the accessible name ("task · person").
import { memo, useCallback, useId, type MouseEvent, type PointerEvent } from 'react'
import Tooltip from '@mui/material/Tooltip'
import Link from '@/components/Link'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { UserName } from '@/components/common/UserName'
import { BlockerBadge } from '@/components/tasks/blockers/BlockerBadge'
import { blockerBadge } from '@/domain/blockers'
import { th } from '@/i18n/th'
import { ASSIGNEE_COL_W, FROZEN_COL_W, FROZEN_COLS, TASK_COL_W } from '@/lib/grid/columns'
import { rememberBoxScroll } from '@/lib/nav/scroll-memory'
import { isPlainClick } from '@/lib/nav/task-href'
import { sumPeopleCount, type GridViewRow } from '@/lib/grid/rows'
import { useGridSel, type GridStore } from './gridStore'
import styles from './grid.module.css'

/** Indent per depth level and the left gutter, from the §8.12 spacing scale (FR-1605). */
/** ↗: no row selection; a plain click records the grid's own scroll box (it scrolls inside, not the window). */
function rememberGridScroll(e: MouseEvent<HTMLElement>): void {
  e.stopPropagation()
  if (!isPlainClick(e)) return
  const box = e.currentTarget.closest<HTMLElement>('[role="grid"]')
  if (box) rememberBoxScroll(box)
}

const indent = (depth: number): string => `calc(var(--space-2) + ${depth} * var(--space-4))`

export interface RowHeaderProps {
  store: GridStore
  r: number
  row: GridViewRow
  height: number
  personName: string | null
  personActive: boolean
  canEdit: boolean
  blockerNames: readonly string[]
  /** "+ คน" is offered (members known, editable leaf) */
  canAddPerson: boolean
  /** PlanGrid's picker is open for this task */
  addPersonOpen: boolean
  onAddPerson: (taskId: string) => void
  onSelectRow: (r: number) => void
  onOpenTask: (taskId: string) => void
  onToggle: (taskId: string) => void
  onUnassign: (taskAssignmentId: string, name: string) => void
  /** M7.1 (FR-816): false = no assignee cell (the task cell spans both frozen columns) */
  showAssignees?: boolean
  /** M7.1 (FR-815): ⠿ on task / merged / sum rows when the task may be moved (editable, not archived) */
  draggable?: boolean
  onDragHandle?: (e: PointerEvent<HTMLElement>, taskId: string) => void
  /** this row's task is being dragged (dimmed, data-dragging) */
  dragging?: boolean
}

/** The row states as text (SPEC §8.9, A11Y-1): the rowheader keeps its short name (task · person) and exposes these
 *  through aria-describedby, since its aria-label replaces the hidden glyph texts inside it. */
export function rowStateTexts(row: GridViewRow, personActive: boolean): string[] {
  const task = row.task
  const out: string[] = []
  if ((row.kind === 'merged' || row.kind === 'assignee') && !personActive) out.push(th.users.deactivatedSuffix)
  if (row.kind === 'assignee') return out
  if (task.certainty === 'TENTATIVE') {
    out.push(th.grid.glyph.tentative)
    if (task.certaintySource === 'task') out.push(th.grid.row.sourceTask)
    else if (task.certaintySource === 'ancestor')
      out.push(th.grid.row.sourceAncestor(task.certaintySourceName ?? ''))
  }
  if (task.completed) out.push(th.grid.row.completed)
  const badge = blockerBadge(task.blockers)
  if (badge)
    out.push(
      badge.kind === 'WAITING' ? th.tasks.blockers.badgeWaiting(badge.open) : th.tasks.blockers.badgeCleared,
    )
  const people = sumPeopleCount(row)
  if (people !== null) out.push(th.grid.sumMode.people(people))
  if ((row.kind === 'task' || row.kind === 'sum') && !task.hasChildren && task.assigneeCount === 0)
    out.push(th.grid.row.unassigned)
  return out
}

export const RowHeader = memo(function RowHeader(p: RowHeaderProps) {
  const { row } = p
  const task = row.task
  const showAssignees = p.showAssignees ?? true
  // buttons are tabbable only inside the focused / selected row (roving focus, §8.9)
  const active = useGridSel(
    p.store,
    (s) => s.rowSelection === row.key || (s.hasSelection && s.focus?.r === p.r),
  )
  const selected = useGridSel(p.store, (s) => s.rowSelection === row.key)
  const tab = active ? 0 : -1
  const isLeaf = !task.hasChildren
  const assignee = row.kind === 'merged' || row.kind === 'assignee' ? row.assignee : null
  const hasToggle = (row.kind === 'task' || row.kind === 'sum') && task.hasChildren
  const collapsed = row.kind === 'task' || row.kind === 'sum' ? row.collapsed : false
  const label = assignee ? `${task.name} · ${p.personName ?? ''}` : task.name
  const people = sumPeopleCount(row)
  const stop = (e: MouseEvent) => e.stopPropagation()
  const descId = useId()
  // keep keyboard focus inside the grid when the row goes away under it (delete, unassign — like GridCell)
  const setRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const grid = el.closest<HTMLElement>('[role="grid"]')
    return () => {
      if (el.contains(document.activeElement)) grid?.focus({ preventScroll: true })
    }
  }, [])
  const states = rowStateTexts(row, p.personActive)
  const ownsTask = row.kind !== 'assignee'

  return (
    <div
      ref={setRef}
      role="rowheader"
      aria-colindex={1}
      aria-colspan={FROZEN_COLS}
      aria-label={label}
      aria-describedby={states.length > 0 ? descId : undefined}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={styles.rowHeader}
      style={{ width: FROZEN_COL_W, height: p.height }}
      data-row-header=""
      data-row-key={row.key}
      data-r={p.r}
      data-dragging={p.dragging ? 'true' : undefined}
      onClick={() => p.onSelectRow(p.r)}
      onDoubleClick={() => p.onOpenTask(task.id)}
    >
      {states.length > 0 ? (
        <span id={descId} className={styles.srOnly}>
          {th.grid.row.states(states.join(' · '))}
        </span>
      ) : null}
      <div className={styles.taskCell} style={{ width: TASK_COL_W, paddingLeft: indent(row.depth) }} data-task-cell="">
        {ownsTask && p.draggable ? (
          // the keyboard path is Alt+↑/↓/→/← on the selected row (M7.1-D17); the button names the gesture
          <button
            type="button"
            tabIndex={tab}
            className={styles.dragHandle}
            aria-label={th.grid.reorder.handle}
            data-drag-handle=""
            onClick={stop}
            onDoubleClick={stop}
            onPointerDown={(e) => {
              e.stopPropagation()
              p.onDragHandle?.(e, task.id)
            }}
          >
            ⠿
          </button>
        ) : null}
        {hasToggle ? (
          <button
            type="button"
            className={styles.toggle}
            tabIndex={tab}
            aria-expanded={!collapsed}
            aria-label={collapsed ? th.grid.row.expand : th.grid.row.collapse}
            onClick={(e) => {
              stop(e)
              p.onToggle(task.id)
            }}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        ) : null}
        {ownsTask ? (
          <span className={styles.name} title={task.name}>
            {task.name}
          </span>
        ) : null}
        {people !== null ? (
          <span className={styles.muted} aria-hidden="true" data-sum-people={people}>
            {th.grid.sumMode.people(people)}
          </span>
        ) : null}
        {ownsTask && task.certainty === 'TENTATIVE' ? (
          <Tooltip
            title={
              task.certaintySource === 'task'
                ? th.grid.row.sourceTask
                : task.certaintySource === 'ancestor'
                  ? th.grid.row.sourceAncestor(task.certaintySourceName ?? '')
                  : th.grid.row.tentative
            }
            describeChild
          >
            <span className={styles.muted}>
              <StatusGlyph kind="tentative" />
              {task.certaintySource === 'task' ? '*' : null}
            </span>
          </Tooltip>
        ) : null}
        {ownsTask && task.completed ? <span className={styles.muted}>{th.grid.row.completed}</span> : null}
        {ownsTask && task.blockers.total > 0 ? (
          <BlockerBadge
            open={task.blockers.open}
            total={task.blockers.total}
            names={p.blockerNames}
            focusable={false}
          />
        ) : null}
        {(row.kind === 'task' || row.kind === 'sum') && isLeaf && task.assigneeCount === 0 ? (
          <span className={styles.muted}>{th.grid.row.unassigned}</span>
        ) : null}
        {ownsTask ? (
          <span className={styles.actions} onClick={stop} onDoubleClick={stop}>
            {/* M6.1-D17: the page link. The click only stops propagation (no row selection), so Next's Link
                navigates in-app and modified / middle clicks stay native; no prefetch per visible row (dense surface,
                §9). A plain click remembers the grid box's scroll (both axes) so ← / Esc on /t come back here. */}
            <Link
              href={`/t/${task.id}`}
              prefetch={false}
              className={styles.openPage}
              tabIndex={tab}
              aria-label={th.grid.row.openTaskPage(task.name)}
              data-open-page=""
              onClick={rememberGridScroll}
            >
              ↗
            </Link>
            {isLeaf && p.canEdit && p.canAddPerson ? (
              <button
                type="button"
                className={styles.addPerson}
                tabIndex={tab}
                aria-label={th.grid.row.addPersonLabel(task.name)}
                aria-haspopup="dialog"
                aria-expanded={p.addPersonOpen}
                data-add-person=""
                onClick={(e) => {
                  stop(e)
                  p.onAddPerson(task.id)
                }}
              >
                {th.grid.row.addPerson}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {showAssignees ? (
        <div className={styles.assigneeCell} style={{ width: ASSIGNEE_COL_W }} data-assignee-cell="">
          {assignee ? (
            <>
              <span className={styles.person}>
                <UserName user={{ name: p.personName ?? '', active: p.personActive }} />
              </span>
              {p.canEdit && assignee.editable ? (
                <button
                  type="button"
                  className={styles.iconButton}
                  tabIndex={tab}
                  aria-label={th.grid.row.removeAssignee(p.personName ?? '')}
                  onClick={(e) => {
                    stop(e)
                    p.onUnassign(assignee.taskAssignmentId, p.personName ?? '')
                  }}
                  onDoubleClick={stop}
                >
                  ×
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
