'use client'
// src/components/grid/useRowMenu.tsx — the plan grid's row-header menu and its "เพิ่มงานย่อย" popover (v3.8, FR-6xx
// grid row menu). Opened by a right click on a row header, its ⋯ button, or Shift+F10 / ContextMenu on a focused row
// header (useGridKeyboard → handlers.rowMenu). Items:
// - always: เปิด (the task panel) · เปิดเป็นหน้า (/t/<id>, a real link; remembers the grid's scroll like ↗)
// - editable project grid (canEdit = project editable and not archived, not the person grid): เพิ่มงานย่อย (depth < 3)
//   · ลบงาน / "ลบ N งาน" when the row is part of a multi-selection (M3's deleteTaskTree + undo toast)
//   · assignee / merged rows with an editable assignment: นำ <name> ออกจากงาน (M3's unassign + undo toast)
import { useCallback, useState, type JSX, type MouseEvent } from 'react'
import { th } from '@/i18n/th'
import { rememberBoxScroll } from '@/lib/nav/scroll-memory'
import { isPlainClick } from '@/lib/nav/task-href'
import { isRowSelected, selectedTaskIds } from '@/lib/grid/row-select'
import { isTaskViewRow, type AnyViewRow, type RowKey } from '@/lib/grid/rows'
import { TASK_MAX_DEPTH_INDEX } from '@/lib/tree/ops'
import type { GridStore } from './gridStore'
import { RowMenu, SubtaskPopover, type RowMenuAnchor, type RowMenuItem } from './RowMenu'

export interface UseRowMenuArgs {
  store: GridStore
  viewRows: readonly AnyViewRow[]
  gridEl: () => HTMLElement | null
  /** may add / delete tasks and unassign here (project grid, editable, not archived) */
  canEdit: boolean
  personName: (userId: string) => string
  openTask: (taskId: string) => void
  onUnassign: (taskAssignmentId: string, name: string) => void
  /** deletes the tasks (moves focus off the rows first) */
  removeTasks: (taskIds: string[]) => void
  createSubtask: (parentId: string, name: string) => void
}

export interface RowMenuApi {
  /** opens the menu for a row (a pointer position or an element to anchor at) */
  open: (rowKey: RowKey, anchor: RowMenuAnchor) => void
  /** the selected tasks a Delete on the row header removes ([] = none) */
  deletableTaskIds: () => string[]
  element: JSX.Element
}

const headerOf = (grid: HTMLElement | null, key: RowKey): HTMLElement | null =>
  grid?.querySelector<HTMLElement>(`[data-row-header][data-row-key="${CSS.escape(key)}"]`) ?? null

export function useRowMenu(a: UseRowMenuArgs): RowMenuApi {
  const [menu, setMenu] = useState<{ rowKey: RowKey; anchor: RowMenuAnchor } | null>(null)
  const [subtaskOf, setSubtaskOf] = useState<{ id: string; name: string } | null>(null)
  const { store, viewRows, canEdit } = a

  const deletableTaskIds = useCallback((): string[] => {
    if (!canEdit) return []
    return selectedTaskIds(store.get(), viewRows.filter(isTaskViewRow))
  }, [canEdit, store, viewRows])

  const items = ((): RowMenuItem[] => {
    if (!menu) return []
    const row = viewRows.find((x) => x.key === menu.rowKey)
    if (!row || !isTaskViewRow(row)) return []
    const task = row.task
    const out: RowMenuItem[] = [
      { id: 'open', label: th.grid.row.menuOpen, onSelect: () => a.openTask(task.id) },
      {
        id: 'openPage',
        label: th.tasks.rowMenu.openPage,
        href: `/t/${task.id}`,
        onSelect: (e: MouseEvent<HTMLElement>) => {
          const grid = a.gridEl()
          if (grid && isPlainClick(e)) rememberBoxScroll(grid)
        },
      },
    ]
    if (!canEdit) return out
    if (task.depth < TASK_MAX_DEPTH_INDEX)
      out.push({
        id: 'addSubtask',
        label: th.tasks.rowMenu.addSubtask,
        onSelect: () => setSubtaskOf({ id: task.id, name: task.name }),
      })
    const s = store.get()
    const many = isRowSelected(s, row.key) ? selectedTaskIds(s, viewRows.filter(isTaskViewRow)) : []
    const ids = many.length > 1 ? many : [task.id]
    out.push({
      id: 'delete',
      label: ids.length > 1 ? th.grid.row.menuDeleteMany(ids.length) : th.tasks.undoLabel.delete,
      onSelect: () => a.removeTasks(ids),
    })
    if ((row.kind === 'merged' || row.kind === 'assignee') && row.assignee.editable) {
      const name = a.personName(row.assignee.userId)
      const taId = row.assignee.taskAssignmentId
      out.push({ id: 'unassign', label: th.grid.row.menuUnassign(name), onSelect: () => a.onUnassign(taId, name) })
    }
    return out
  })()

  const close = useCallback(() => setMenu(null), [])
  const open = useCallback((rowKey: RowKey, anchor: RowMenuAnchor) => setMenu({ rowKey, anchor }), [])

  const subtaskAnchor = useCallback((): Element | null => {
    const grid = a.gridEl()
    if (!subtaskOf) return grid
    const row = viewRows.find((x) => isTaskViewRow(x) && x.kind !== 'assignee' && x.task.id === subtaskOf.id)
    return (row ? headerOf(grid, row.key) : null) ?? grid
  }, [a, subtaskOf, viewRows])
  const closeSubtask = useCallback(() => {
    const id = subtaskOf?.id
    setSubtaskOf(null)
    // back to the parent's row header (or the grid), never <body>
    const grid = a.gridEl()
    const row = viewRows.find((x) => isTaskViewRow(x) && x.kind !== 'assignee' && x.task.id === id)
    const header = row ? headerOf(grid, row.key) : null
    if (header) header.focus({ preventScroll: true })
    else grid?.focus({ preventScroll: true })
  }, [a, subtaskOf, viewRows])

  const element = (
    <>
      <RowMenu anchor={menu?.anchor ?? null} items={items} onClose={close} />
      <SubtaskPopover task={subtaskOf} anchor={subtaskAnchor} onCreate={a.createSubtask} onClose={closeSubtask} />
    </>
  )
  return { open, deletableTaskIds, element }
}
