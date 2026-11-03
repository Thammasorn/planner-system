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
// M8 (FR-706, AC-702, §8.3, plan/m08 S3.7): task / merged / sum rows bound to a live milestone show "→◆<name>" and, when
// lateForMilestone, a ⚠ "เลย milestone" chip (tooltip: the late hint with the milestone date) — both also in the row's
// state texts (aria-describedby), the row header carries data-late-for-milestone.
// M9 (plan/m09 S3.4, M9-D28): in the person grid a merged row also shows the task's parent path (muted breadcrumb) and a
// second action "เปิดในแผนงานโปรเจค" (onOpenInProject → /projects/<pid>/plan?task=) next to the ↗ task-page link
// (SPEC v3.2 M6.1-D17 keeps ↗ = /t/<id>); PlanGrid passes no drag, no "+ คน" and no assignee column there.
// v3.9 (owner feedback): the name + chips sit in one clipped box (.taskMain) whose measured width picks a chip level
// (src/lib/grid/task-chips.ts): first "→◆name" → "◆", then the late / blocker chips → icon-only (⚠ / ⊘ + count, full
// text in tooltip + aria-label). The task cell clips at its own edge, so nothing paints over the ผู้รับผิดชอบ column.
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import Tooltip from '@mui/material/Tooltip'
import ViewTimelineOutlined from '@mui/icons-material/ViewTimelineOutlined'
import BlockOutlined from '@mui/icons-material/BlockOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import Link from '@/components/Link'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { UserName } from '@/components/common/UserName'
import { BlockerBadge } from '@/components/tasks/blockers/BlockerBadge'
import { blockerBadge } from '@/domain/blockers'
import type { ISODate } from '@/domain/types'
import { th } from '@/i18n/th'
import { ASSIGNEE_COL_W, FROZEN_COL_W, FROZEN_COLS, TASK_COL_W } from '@/lib/grid/columns'
import { formatThaiDate } from '@/lib/format'
import { rememberBoxScroll } from '@/lib/nav/scroll-memory'
import { isPlainClick } from '@/lib/nav/task-href'
import { taskLeadLayout } from '@/lib/grid/row-layout'
import { taskChipLevel, type ChipLevel, type TaskChips } from '@/lib/grid/task-chips'
import { inCheckMode, isRowSelected } from '@/lib/grid/row-select'
import { sumPeopleCount, type GridViewRow } from '@/lib/grid/rows'
import { useGridSel, type GridStore } from './gridStore'
import styles from './grid.module.css'

/** ↗: no row selection; a plain click records the grid's own scroll box (it scrolls inside, not the window). */
function rememberGridScroll(e: MouseEvent<HTMLElement>): void {
  e.stopPropagation()
  if (!isPlainClick(e)) return
  const box = e.currentTarget.closest<HTMLElement>('[role="grid"]')
  if (box) rememberBoxScroll(box)
}

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
  /** v3.8: Mod+click = 'toggle', Shift+click = 'range' (task rows multi-select) */
  onSelectRow: (r: number, how?: 'toggle' | 'range') => void
  /** v3.8: the ⋯ row menu (same menu as a right click / Shift+F10 on the row header) */
  onRowMenu?: (r: number, anchor: HTMLElement) => void
  onOpenTask: (taskId: string) => void
  onToggle: (taskId: string) => void
  onUnassign: (taskAssignmentId: string, name: string) => void
  /** M7.1 (FR-816): false = no assignee cell (the task cell spans both frozen columns) */
  showAssignees?: boolean
  /** v3.9: a plain click also opens the task panel (project grid) */
  openOnClick?: boolean
  /** v3.9 inline rename (FR-823): the draft while this row's name is being edited, null otherwise */
  renameDraft?: string | null
  /** v3.9: start renaming (double-click on the task cell; draft null = the current name) — absent = not renamable */
  onStartRename?: (r: number, draft: string | null) => void
  /** v3.9: the rename ended — the new trimmed name, or null = cancelled / unchanged / empty */
  onRenameEnd?: (taskId: string, next: string | null) => void
  /** v3.9: ☐ multi-select checkbox in the lead (project grid, editable) */
  selectable?: boolean
  /** M7.1 (FR-815): ⠿ on task / merged / sum rows when the task may be moved (editable, not archived) */
  draggable?: boolean
  onDragHandle?: (e: PointerEvent<HTMLElement>, taskId: string) => void
  /** this row's task is being dragged (dimmed, data-dragging) */
  dragging?: boolean
  /** M8 (S3.7): the live milestone the task is bound to (task.milestoneId resolved in model.milestones) */
  milestone?: { name: string; date: ISODate } | null
  /** M9 person grid: parent names root → parent (shown muted after the name) */
  breadcrumb?: readonly string[]
  /** M9 person grid: "เปิดในแผนงานโปรเจค" (th.people.grid.openTask) */
  onOpenInProject?: (taskId: string) => void
}

/** The row states as text (SPEC §8.9, A11Y-1): the rowheader keeps its short name (task · person) and exposes these
 *  through aria-describedby, since its aria-label replaces the hidden glyph texts inside it. */
export function rowStateTexts(
  row: GridViewRow,
  personActive: boolean,
  milestone?: { name: string } | null,
): string[] {
  const task = row.task
  const out: string[] = []
  if ((row.kind === 'merged' || row.kind === 'assignee') && !personActive)
    out.push(th.users.deactivatedSuffix)
  if (row.kind === 'assignee') return out
  if (milestone) {
    out.push(th.milestones.grid.taskLinkLabel(milestone.name))
    if (task.lateForMilestone) out.push(th.milestones.late)
  }
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

/** Rough width of the tentative glyph / completed text next to the name (px), counted against the chips' budget. */
const TENTATIVE_W = 20
const COMPLETED_W = 52

/**
 * The chip level of one row: a ResizeObserver on the name + chips box (its width does not depend on its content —
 * flex 1 1 0, min-width 0 — so collapsing never feeds back). State changes only when the level changes.
 */
function useChipLevel(chips: TaskChips): [(el: HTMLElement | null) => void, ChipLevel] {
  const [width, setWidth] = useState(0)
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[entries.length - 1]?.contentRect.width ?? 0
      setWidth((prev) => (Math.round(w) === prev ? prev : Math.round(w)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, taskChipLevel(width, chips)]
}

/** Icon-only blocker chip (level 2): ⊘ + open count (✓ when cleared); the full text is its aria-label + tooltip. */
function CompactBlocker(p: { open: number; total: number; names: readonly string[] }) {
  const badge = blockerBadge({ open: p.open, total: p.total })
  if (badge === null) return null
  const waiting = badge.kind === 'WAITING'
  const text = waiting ? th.tasks.blockers.badgeWaiting(badge.open) : th.tasks.blockers.badgeCleared
  return (
    <Tooltip
      title={p.names.length > 0 ? `${text} · ${th.tasks.blockers.badgeTooltip(p.names.join(', '))}` : text}
      describeChild
    >
      <span
        className={styles.chipIcon}
        role="img"
        aria-label={text}
        data-blocker-badge={badge.kind}
        data-chip-compact=""
        data-waiting={waiting ? 'true' : undefined}
      >
        {waiting ? (
          <>
            <BlockOutlined aria-hidden="true" fontSize="inherit" />
            <span aria-hidden="true">{badge.open}</span>
          </>
        ) : (
          <CheckOutlined aria-hidden="true" fontSize="inherit" />
        )}
      </span>
    </Tooltip>
  )
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
  const selected = useGridSel(p.store, (s) => isRowSelected(s, row.key))
  // v3.9: in check mode (☐ / Mod / Shift selection) every ☐ shows and the selected rows are checked (§8.9: a checkbox,
  // not colour alone); a plain click selects without checking
  const checkMode = useGridSel(p.store, inCheckMode)
  const checked = selected && checkMode
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
  const headerEl = useRef<HTMLDivElement | null>(null)
  const setRef = useCallback((el: HTMLDivElement | null) => {
    headerEl.current = el
    if (!el) return
    const grid = el.closest<HTMLElement>('[role="grid"]')
    return () => {
      if (el.contains(document.activeElement)) grid?.focus({ preventScroll: true })
    }
  }, [])
  const ms = row.kind !== 'assignee' && p.milestone ? p.milestone : null
  const late = ms !== null && task.lateForMilestone
  const states = rowStateTexts(row, p.personActive, ms)
  const ownsTask = row.kind !== 'assignee'
  const canRename = ownsTask && p.canEdit && p.onStartRename !== undefined
  const renameDraft = canRename ? (p.renameDraft ?? null) : null
  // v3.9: an unassigned leaf shows "รอมอบหมาย" + "+ คน" in the ผู้รับผิดชอบ column (next to the name when it is hidden)
  const unassigned = (row.kind === 'task' || row.kind === 'sum') && isLeaf && task.assigneeCount === 0
  const canAddHere = isLeaf && p.canEdit && p.canAddPerson
  const addPersonInActions = canAddHere && !(unassigned && showAssignees)
  const addPersonButton = canAddHere ? (
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
  ) : null
  const lead = taskLeadLayout(row.depth, { check: Boolean(p.selectable), handle: Boolean(p.draggable) })
  const hasBlocker = ownsTask && task.blockers.total > 0
  const [mainRef, chipLevel] = useChipLevel({
    ms: ms !== null,
    late,
    blocker: hasBlocker,
    extra:
      (ownsTask && task.certainty === 'TENTATIVE' ? TENTATIVE_W : 0) +
      (ownsTask && task.completed ? COMPLETED_W : 0),
  })

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
      data-task-id={ownsTask ? task.id : undefined}
      data-r={p.r}
      data-dragging={p.dragging ? 'true' : undefined}
      data-late-for-milestone={late ? 'true' : undefined}
      onClick={(e) => {
        const how = e.metaKey || e.ctrlKey ? 'toggle' : e.shiftKey ? 'range' : undefined
        if (how === 'range') window.getSelection()?.removeAllRanges()
        if (how) p.onSelectRow(p.r, how)
        else {
          p.onSelectRow(p.r)
          // v3.9: a plain click opens (or switches) the task panel
          if (p.openOnClick && e.detail <= 1) p.onOpenTask(task.id)
        }
      }}
      onDoubleClick={p.onStartRename ? undefined : () => p.onOpenTask(task.id)}
    >
      {states.length > 0 ? (
        <span id={descId} className={styles.srOnly}>
          {th.grid.row.states(states.join(' · '))}
        </span>
      ) : null}
      <div
        className={styles.taskCell}
        style={{ width: TASK_COL_W }}
        data-task-cell=""
        onDoubleClick={
          // v3.9: double-click on the task cell renames in place (FR-823); read-only grids keep "open"
          canRename && renameDraft === null ? () => p.onStartRename?.(p.r, null) : undefined
        }
      >
        {ownsTask ? (
          // v3.9 lead (src/lib/grid/row-layout.ts): [⠿ gutter][depth indent][caret slot] — the indent sits after the
          // gutter, the caret slot is narrow, so a top-level leaf name sits right after ⠿ + one empty caret slot
          <span className={styles.lead} style={{ width: lead.leadW }} data-lead="">
            {p.selectable ? (
              <input
                type="checkbox"
                className={styles.rowCheckbox}
                tabIndex={tab}
                checked={checked}
                aria-label={th.grid.row.selectLabel(task.name)}
                data-row-checkbox=""
                data-row-check={checked ? '' : undefined}
                data-visible={checkMode ? 'true' : undefined}
                onClick={stop}
                onDoubleClick={stop}
                onChange={() => p.onSelectRow(p.r, 'toggle')}
              />
            ) : null}
            {p.draggable ? (
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
            {lead.indentW > 0 ? (
              <span
                className={styles.indent}
                style={{ width: lead.indentW }}
                aria-hidden="true"
                data-indent={row.depth}
              />
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
                onDoubleClick={stop}
              >
                {collapsed ? '▸' : '▾'}
              </button>
            ) : (
              // leaf rows keep the caret slot so sibling names line up (only real children indent further)
              <span className={styles.toggleSpacer} aria-hidden="true" data-toggle-spacer="" />
            )}
          </span>
        ) : null}
        <span className={styles.taskMain} ref={mainRef} data-task-main="" data-chip-level={chipLevel}>
          {ownsTask && renameDraft !== null ? (
            <RenameInput
              name={task.name}
              draft={renameDraft}
              onEnd={(next, how) => {
                p.onRenameEnd?.(task.id, next)
                // Enter / Esc keep the keyboard on the row (blur went elsewhere on purpose)
                if (how !== 'blur') headerEl.current?.focus({ preventScroll: true })
              }}
            />
          ) : ownsTask ? (
            <span className={styles.name} title={task.name} data-task-name="">
              {task.name}
            </span>
          ) : null}
          {p.breadcrumb && p.breadcrumb.length > 0 ? (
            <span className={styles.breadcrumb} data-breadcrumb="">
              {p.breadcrumb.join(' › ')}
            </span>
          ) : null}
          {ms ? (
            <span
              className={styles.msTaskLink}
              title={th.milestones.grid.taskLinkLabel(ms.name)}
              aria-hidden="true"
              data-ms-link=""
              data-chip-compact={chipLevel >= 1 ? '' : undefined}
            >
              {chipLevel >= 1 ? '◆' : th.milestones.grid.taskLink(ms.name)}
            </span>
          ) : null}
          {late && ms ? (
            <Tooltip
              title={
                chipLevel >= 2
                  ? `${th.milestones.late} · ${th.milestones.lateHint(formatThaiDate(ms.date, 'medium'))}`
                  : th.milestones.lateHint(formatThaiDate(ms.date, 'medium'))
              }
              describeChild
            >
              {chipLevel >= 2 ? (
                <span
                  className={styles.msLateChip}
                  role="img"
                  aria-label={th.milestones.late}
                  data-ms-late=""
                  data-chip-compact=""
                >
                  <span aria-hidden="true">⚠</span>
                </span>
              ) : (
                <span className={styles.msLateChip} data-ms-late="">
                  <span aria-hidden="true">⚠ </span>
                  {th.milestones.late}
                </span>
              )}
            </Tooltip>
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
          {hasBlocker && chipLevel >= 2 ? (
            <CompactBlocker open={task.blockers.open} total={task.blockers.total} names={p.blockerNames} />
          ) : hasBlocker ? (
            <BlockerBadge
              open={task.blockers.open}
              total={task.blockers.total}
              names={p.blockerNames}
              focusable={false}
            />
          ) : null}
          {unassigned && !showAssignees ? (
            <span className={styles.muted}>{th.grid.row.unassigned}</span>
          ) : null}
        </span>
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
            {p.onOpenInProject ? (
              <button
                type="button"
                className={styles.openPage}
                tabIndex={tab}
                aria-label={th.people.grid.openTask(task.name)}
                title={th.people.grid.openTask(task.name)}
                data-open-in-project=""
                onClick={(e) => {
                  stop(e)
                  p.onOpenInProject?.(task.id)
                }}
              >
                <ViewTimelineOutlined fontSize="inherit" aria-hidden="true" />
              </button>
            ) : null}
            {addPersonInActions ? addPersonButton : null}
            {p.onRowMenu ? (
              <button
                type="button"
                className={styles.openPage}
                tabIndex={tab}
                aria-label={th.grid.row.menuButton(label)}
                aria-haspopup="menu"
                data-row-menu=""
                onClick={(e) => {
                  stop(e)
                  p.onRowMenu?.(p.r, e.currentTarget)
                }}
              >
                ⋯
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {showAssignees ? (
        <div className={styles.assigneeCell} style={{ width: ASSIGNEE_COL_W }} data-assignee-cell="">
          {unassigned ? (
            <>
              <span className={styles.unassignedHint} data-unassigned="">
                {th.grid.row.unassigned}
              </span>
              {addPersonButton}
            </>
          ) : null}
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
              {!ownsTask && p.onRowMenu ? (
                <button
                  type="button"
                  className={styles.openPage}
                  tabIndex={tab}
                  aria-label={th.grid.row.menuButton(label)}
                  aria-haspopup="menu"
                  data-row-menu=""
                  onClick={(e) => {
                    stop(e)
                    p.onRowMenu?.(p.r, e.currentTarget)
                  }}
                  onDoubleClick={stop}
                >
                  ⋯
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})

/** Longest task name (same bound as the task list's InlineEditText, M3). */
export const TASK_NAME_MAX = 500

/** The trimmed new name, or null when the edit is a no-op (empty → revert, unchanged). Pure, unit-tested. */
export function renameResult(name: string, value: string): string | null {
  const next = value.trim().slice(0, TASK_NAME_MAX)
  return next === '' || next === name ? null : next
}

/**
 * v3.9 inline rename (FR-823): Enter or blur saves, Esc cancels, an empty value reverts. Keys stay inside the input
 * (the grid's keyboard handler must not move the selection while typing).
 */
function RenameInput(p: {
  name: string
  draft: string
  onEnd: (next: string | null, how: 'enter' | 'escape' | 'blur') => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    const end = el.value.length
    // F2 / Enter / double-click keep the name with the caret at the end; a typed character replaces it (Excel)
    el.setSelectionRange(end, end)
  }, [])
  const finish = (how: 'enter' | 'escape' | 'blur') => {
    if (done.current) return
    done.current = true
    p.onEnd(how === 'escape' ? null : renameResult(p.name, ref.current?.value ?? ''), how)
  }
  const stopMouse = (e: MouseEvent) => e.stopPropagation()
  return (
    <input
      ref={ref}
      className={styles.nameInput}
      defaultValue={p.draft}
      maxLength={TASK_NAME_MAX}
      aria-label={th.grid.row.renameLabel(p.name)}
      data-testid="grid-rename-input"
      onClick={stopMouse}
      onDoubleClick={stopMouse}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') {
          e.preventDefault()
          finish('enter')
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish('escape')
        }
      }}
      onBlur={() => finish('blur')}
    />
  )
}
