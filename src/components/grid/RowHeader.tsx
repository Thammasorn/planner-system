'use client'
// src/components/grid/RowHeader.tsx — the sticky name column of one row (SPEC §8.3, FR-805/808, FR-643, AC-203,
// M6-D18/D19/D31/D33). Indent by depth, ▸/▾ for parents, name (click selects the row, double-click or ↗ opens the
// panel), assignee via M1 UserName ("(ปิดใช้งาน)" for deactivated people), × unassigns, "+ คน" (hover and
// focus-within) opens PlanGrid's AddPersonPopover (M3's AssigneePicker; owned by PlanGrid so it survives the row
// re-keying t:<task> → a:<assignment> after the first pick), ⛔ via M3's BlockerBadge, ◐ + "*" for tentative.
import { memo, useCallback, useId, type MouseEvent } from 'react'
import Tooltip from '@mui/material/Tooltip'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { UserName } from '@/components/common/UserName'
import { BlockerBadge } from '@/components/tasks/blockers/BlockerBadge'
import { blockerBadge } from '@/domain/blockers'
import { th } from '@/i18n/th'
import { NAME_COL_W } from '@/lib/grid/columns'
import type { ViewRow } from '@/lib/grid/rows'
import { useGridSel, type GridStore } from './gridStore'
import styles from './grid.module.css'

const INDENT = 16

export interface RowHeaderProps {
  store: GridStore
  r: number
  row: ViewRow
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
}

/** The row states as text (SPEC §8.9, A11Y-1): the rowheader keeps its short name (task · person) and exposes these
 *  through aria-describedby, since its aria-label replaces the hidden glyph texts inside it. */
export function rowStateTexts(row: ViewRow, personActive: boolean): string[] {
  const task = row.task
  const out: string[] = []
  if (row.kind !== 'task' && !personActive) out.push(th.users.deactivatedSuffix)
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
  if (row.kind === 'task' && !task.hasChildren && task.assigneeCount === 0) out.push(th.grid.row.unassigned)
  return out
}

export const RowHeader = memo(function RowHeader(p: RowHeaderProps) {
  const { row } = p
  const task = row.task
  // buttons are tabbable only inside the focused / selected row (roving focus, §8.9)
  const active = useGridSel(
    p.store,
    (s) => s.rowSelection === row.key || (s.hasSelection && s.focus?.r === p.r),
  )
  const selected = useGridSel(p.store, (s) => s.rowSelection === row.key)
  const tab = active ? 0 : -1
  const isLeaf = !task.hasChildren
  const ownName = row.kind === 'assignee' ? (p.personName ?? '') : task.name
  const label = row.kind === 'task' ? task.name : `${task.name} · ${p.personName ?? ''}`
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

  return (
    <div
      ref={setRef}
      role="rowheader"
      aria-colindex={1}
      aria-label={label}
      aria-describedby={states.length > 0 ? descId : undefined}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={styles.rowHeader}
      style={{ width: NAME_COL_W, height: p.height, paddingLeft: 6 + row.depth * INDENT }}
      data-row-header=""
      data-row-key={row.key}
      data-r={p.r}
      onClick={() => p.onSelectRow(p.r)}
      onDoubleClick={() => p.onOpenTask(task.id)}
    >
      {states.length > 0 ? (
        <span id={descId} className={styles.srOnly}>
          {th.grid.row.states(states.join(' · '))}
        </span>
      ) : null}
      {row.kind === 'task' && task.hasChildren ? (
        <button
          type="button"
          className={styles.toggle}
          tabIndex={tab}
          aria-expanded={!row.collapsed}
          aria-label={row.collapsed ? th.grid.row.expand : th.grid.row.collapse}
          onClick={(e) => {
            stop(e)
            p.onToggle(task.id)
          }}
        >
          {row.collapsed ? '▸' : '▾'}
        </button>
      ) : null}
      {row.kind === 'assignee' ? (
        <span className={styles.name}>
          <UserName user={{ name: ownName, active: p.personActive }} />
        </span>
      ) : (
        <span className={styles.name}>{task.name}</span>
      )}
      {row.kind === 'merged' ? (
        <span className={styles.person}>
          <UserName user={{ name: p.personName ?? '', active: p.personActive }} />
        </span>
      ) : null}
      {row.kind !== 'assignee' && task.certainty === 'TENTATIVE' ? (
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
      {row.kind !== 'assignee' && task.completed ? (
        <span className={styles.muted}>{th.grid.row.completed}</span>
      ) : null}
      {row.kind !== 'assignee' && task.blockers.total > 0 ? (
        <BlockerBadge
          open={task.blockers.open}
          total={task.blockers.total}
          names={p.blockerNames}
          focusable={false}
        />
      ) : null}
      {row.kind === 'task' && isLeaf && task.assigneeCount === 0 ? (
        <span className={styles.muted}>{th.grid.row.unassigned}</span>
      ) : null}
      <span className={styles.actions} onClick={stop} onDoubleClick={stop}>
        {row.kind !== 'assignee' ? (
          <button
            type="button"
            className={styles.iconButton}
            tabIndex={tab}
            aria-label={th.grid.row.openTask(task.name)}
            onClick={(e) => {
              stop(e)
              p.onOpenTask(task.id)
            }}
          >
            ↗
          </button>
        ) : null}
        {row.kind !== 'task' && p.canEdit && row.assignee.editable ? (
          <button
            type="button"
            className={styles.iconButton}
            tabIndex={tab}
            aria-label={th.grid.row.removeAssignee(p.personName ?? '')}
            onClick={(e) => {
              stop(e)
              p.onUnassign(row.assignee.taskAssignmentId, p.personName ?? '')
            }}
          >
            ×
          </button>
        ) : null}
        {row.kind !== 'assignee' && isLeaf && p.canEdit && p.canAddPerson ? (
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
    </div>
  )
})
