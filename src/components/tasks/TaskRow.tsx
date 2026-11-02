'use client'
import { useRef, useState, type MouseEvent } from 'react'
import Checkbox from '@mui/material/Checkbox'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import BlockOutlined from '@mui/icons-material/BlockOutlined'
import ChevronRight from '@mui/icons-material/ChevronRight'
import DragIndicator from '@mui/icons-material/DragIndicator'
import ExpandMore from '@mui/icons-material/ExpandMore'
import MoreHoriz from '@mui/icons-material/MoreHoriz'
import { CertaintyBadge } from '@/components/common/CertaintyBadge'
import { InlineEditText } from '@/components/common/InlineEditText'
import { MilestoneTaskTag } from '@/components/milestones/MilestoneTaskTag'
import { TREE_INDENT, type HandleRef } from '@/components/tree/SortableTree'
import type { Certainty } from '@/domain/types'
import { th } from '@/i18n/th'
import type { MilestoneRef } from '@/lib/contracts/milestones'
import type { PersonOption } from '@/lib/contracts/people'
import type { TaskStatusDTO } from '@/lib/contracts/tasks'
import { formatThaiDate } from '@/lib/format'
import type { TaskRowModel } from '@/lib/tasks/tree'
import { AssigneeChips } from './AssigneeChips'
import { AssigneeAddButton } from './AssigneePicker'
import { BlockerBadge } from './blockers/BlockerBadge'
import { HasBodyMark, OpenAsPageLink } from './OpenAsPage'
import { StatusChip } from './status/StatusChip'
import styles from './TaskRow.module.css'

export interface TaskRowActions {
  select: (e: MouseEvent, key: string, id: string) => void
  toggleExpand: (id: string) => void
  toggleDone: (id: string) => void
  rename: (id: string, name: string) => Promise<void>
  openStatus: (anchor: HTMLElement, id: string) => void
  openPanel: (id: string) => void
  /** Row menu "เปิดเป็นหน้า" (FR-685): navigate to /t/<id>, remembering the list's scroll position. */
  openPage: (id: string) => void
  unassign: (assignmentId: string, label: string) => void
  addSubtask: (row: TaskRowModel) => void
  moveUp: (id: string) => void
  moveDown: (id: string) => void
  indent: (id: string) => void
  outdent: (id: string) => void
  remove: (id: string) => void
  /** Enter on the row (and Enter that commits a rename, M3-D18): quick add below the row. */
  quickAddBelow: (row: TaskRowModel) => void
}

export interface TaskRowProps {
  row: TaskRowModel
  rowKey: string
  depth: number
  focused: boolean
  selected: boolean
  expanded: boolean
  ops: boolean
  canEdit: boolean
  canManage: boolean
  showPath: boolean
  status: TaskStatusDTO | undefined
  certainty: Certainty
  blockerNames: readonly string[]
  unionUserIds: readonly string[]
  people: ReadonlyMap<string, PersonOption>
  projectId: string
  memberIds: ReadonlySet<string>
  handleRef?: HandleRef | undefined
  handleProps?: Record<string, unknown> | undefined
  invalid?: boolean | undefined
  /** M8 (FR-613/706): the row's live milestone → "◆ name" (+ "เลย milestone" when `row.lateForMilestone`). */
  milestone?: MilestoneRef | null | undefined
  actions: TaskRowActions
}

function dates(row: TaskRowModel): string | null {
  if (row.startDate && row.dueDate)
    return th.tasks.dateRange(formatThaiDate(row.startDate), formatThaiDate(row.dueDate))
  if (row.dueDate) return formatThaiDate(row.dueDate)
  if (row.startDate) return formatThaiDate(row.startDate)
  return null
}

/**
 * One outliner row (FR-603/606/607, M3-D22): `role="row"` named by the task, `aria-level`, `aria-selected`,
 * `aria-expanded` when it has children; roving tabIndex is decided by TaskList — the row is the only tab stop, so
 * every inner control is `tabIndex={-1}` and reached by its row key (F2 name, S status, Space panel, Shift+F10 /
 * ContextMenu row menu). Completed rows are struck through with a checked box (not colour only).
 */
export function TaskRow(p: TaskRowProps) {
  const { row, actions: a, handleRef, handleProps } = p
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const renameByEnter = useRef(false) // M3-D18: Enter in the rename field commits *and* opens quick add below
  const done = row.completedOn !== null
  const when = dates(row)
  const close = () => setMenu(null)
  const menuItem = (label: string, run: () => void, disabled = false) => (
    <MenuItem
      disabled={disabled}
      onClick={() => {
        close()
        run()
      }}
    >
      {label}
    </MenuItem>
  )
  return (
    <div
      ref={rowRef}
      role="row"
      aria-level={p.depth + 1}
      aria-selected={p.selected}
      aria-expanded={row.hasChildren ? p.expanded : undefined}
      aria-label={row.name}
      tabIndex={p.focused ? 0 : -1}
      className={styles.row}
      data-row-key={p.rowKey}
      data-task-id={row.id}
      data-completed={done ? 'true' : undefined}
      onClick={(e) => {
        if (!e.currentTarget.contains(e.target as Node)) return // portalled menus/popovers
        if ((e.target as HTMLElement).closest('button,a,input,[role="button"],.MuiChip-root')) return
        a.select(e, p.rowKey, row.id)
      }}
    >
      <div role="gridcell" className={styles.cell}>
        <span className={styles.lead}>
          {p.ops && handleRef ? (
            <button
              type="button"
              ref={handleRef}
              {...handleProps}
              className={`${styles.iconButton} ${styles.handle}`}
              aria-label={th.tasks.dragHandle}
              tabIndex={-1}
            >
              <DragIndicator sx={{ fontSize: 'var(--font-lg)' }} />
            </button>
          ) : (
            <span className={styles.spacer} />
          )}
          <span style={{ display: 'inline-block', width: p.depth * TREE_INDENT }} />
          {row.hasChildren ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={p.expanded ? th.tasks.collapse : th.tasks.expand}
              aria-expanded={p.expanded}
              tabIndex={-1}
              onClick={() => a.toggleExpand(row.id)}
            >
              {p.expanded ? (
                <ExpandMore sx={{ fontSize: 'var(--font-lg)' }} />
              ) : (
                <ChevronRight sx={{ fontSize: 'var(--font-lg)' }} />
              )}
            </button>
          ) : (
            <span className={styles.spacer} />
          )}
          <Checkbox
            size="small"
            checked={done}
            disabled={!p.canEdit}
            onChange={() => a.toggleDone(row.id)}
            sx={{ p: 0.5 }}
            slotProps={{ input: { 'aria-label': th.tasks.completeCheckbox(row.name), tabIndex: -1 } }}
          />
        </span>
        <span className={styles.body}>
          <span
            className={styles.name}
            onKeyDownCapture={(e) => {
              if ((e.target as HTMLElement).tagName !== 'INPUT') return
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) renameByEnter.current = true
              else if (e.key === 'Escape') renameByEnter.current = false
            }}
            onClickCapture={(e) => {
              // Rename = F2, double-click or a click on the name of an already-selected row (M3-D18).
              if (e.detail === 0) return
              if (!p.selected || e.metaKey || e.ctrlKey || e.shiftKey) {
                e.stopPropagation()
                e.preventDefault()
                a.select(e, p.rowKey, row.id)
              }
            }}
          >
            <InlineEditText
              value={row.name}
              label={th.tasks.panel.name}
              disabled={!p.canEdit}
              maxLength={500}
              variant="body2"
              tabIndex={-1}
              onRefocus={() => {
                rowRef.current?.focus()
                if (!renameByEnter.current) return
                renameByEnter.current = false
                a.quickAddBelow(row)
              }}
              onCommit={(name) =>
                a.rename(row.id, name).catch((err: unknown) => {
                  renameByEnter.current = false // a failed save reverts and stays on the row
                  throw err
                })
              }
            />
            {row.hasBody ? <HasBodyMark /> : null}
          </span>
          {p.invalid ? (
            <span className={styles.invalid}>
              <BlockOutlined sx={{ fontSize: 'var(--font-lg)' }} aria-hidden="true" />
              {th.tasks.dropInvalid}
            </span>
          ) : null}
          <span className={styles.meta}>
            {p.status ? (
              <StatusChip
                status={p.status}
                disabled={!p.canEdit}
                tabIndex={-1}
                onClick={(e) => a.openStatus(e.currentTarget, row.id)}
              />
            ) : null}
            {row.blockers.total > 0 ? (
              <BlockerBadge
                open={row.blockers.open}
                total={row.blockers.total}
                names={p.blockerNames}
                focusable={false}
              />
            ) : null}
            {p.certainty === 'TENTATIVE' ? <CertaintyBadge certainty="TENTATIVE" /> : null}
            {p.milestone ? (
              <MilestoneTaskTag name={p.milestone.name} date={p.milestone.date} late={row.lateForMilestone} />
            ) : null}
            <AssigneeChips
              assignees={row.assignees}
              unionUserIds={p.unionUserIds}
              isLeaf={row.isLeaf}
              people={p.people}
              canEdit={p.canEdit}
              onUnassign={a.unassign}
              removeTabIndex={-1}
            />
            {row.isLeaf && p.canEdit ? (
              <AssigneeAddButton
                projectId={p.projectId}
                taskId={row.id}
                projectMemberIds={p.memberIds}
                assignedUserIds={new Set(row.assignees.map((x) => x.userId))}
                canManage={p.canManage}
                tabIndex={-1}
              />
            ) : null}
            {when ? <span className={styles.muted}>{when}</span> : null}
            {done && row.completedOn ? (
              <span className={styles.muted}>{th.tasks.completedOn(formatThaiDate(row.completedOn))}</span>
            ) : null}
            <OpenAsPageLink taskId={row.id} tabIndex={-1} />
            <button
              type="button"
              className={styles.iconButton}
              aria-label={th.tasks.rowMenu.label}
              aria-haspopup="menu"
              tabIndex={-1}
              data-row-menu=""
              onClick={(e) => setMenu(e.currentTarget)}
            >
              <MoreHoriz sx={{ fontSize: 'var(--font-lg)' }} />
            </button>
          </span>
          {p.showPath && row.parentPath.length > 0 ? (
            <span className={styles.path}>{th.tasks.groups.parentPath(row.parentPath.join(' › '))}</span>
          ) : null}
        </span>
      </div>
      <Menu anchorEl={menu} open={menu !== null} onClose={close}>
        {menuItem(th.tasks.rowMenu.open, () => a.openPanel(row.id))}
        {menuItem(th.tasks.rowMenu.openPage, () => a.openPage(row.id))}
        {p.canEdit && row.depth < 2 ? menuItem(th.tasks.rowMenu.addSubtask, () => a.addSubtask(row)) : null}
        {menuItem(th.tasks.rowMenu.moveUp, () => a.moveUp(row.id), !p.ops)}
        {menuItem(th.tasks.rowMenu.moveDown, () => a.moveDown(row.id), !p.ops)}
        {menuItem(th.tasks.rowMenu.indent, () => a.indent(row.id), !p.ops)}
        {menuItem(th.tasks.rowMenu.outdent, () => a.outdent(row.id), !p.ops)}
        {menuItem(th.tasks.rowMenu.delete, () => a.remove(row.id), !p.canEdit)}
      </Menu>
    </div>
  )
}
