'use client'
// src/components/grid/AddPersonPopover.tsx — the grid's "+ คน" picker (M6-D19, AC-203, SPEC §8.9). One popover for the
// whole grid, owned by PlanGrid and keyed by task id, so it survives the task's row re-keying after a pick
// (t:<task> → a:<assignment> on the first assignee, a:<assignment> → t:<task> + assignee rows on the second). Its
// anchor is re-resolved through the task's current row; focus returns to the grid on close (PlanGrid.closeAddPerson).
import Box from '@mui/material/Box'
import Popover from '@mui/material/Popover'
import type { JSX } from 'react'
import { AssigneePicker } from '@/components/tasks/AssigneePicker'
import { th } from '@/i18n/th'

export interface PickerContext {
  projectId: string
  projectMemberIds: ReadonlySet<string>
  canManage: boolean
}

export interface AddPersonPopoverProps {
  /** the task the picker is open for (null = closed) */
  taskId: string | null
  picker: PickerContext | null
  /** the task's current assignees (they are not offered again) */
  assignedUserIds: ReadonlySet<string>
  /** resolves the anchor at positioning time (the "+ คน" button of the task's current row, else the grid) */
  anchor: () => Element | null
  onClose: () => void
}

export function AddPersonPopover(p: AddPersonPopoverProps): JSX.Element | null {
  if (!p.picker) return null
  const open = p.taskId !== null
  return (
    <Popover
      open={open}
      anchorEl={open ? p.anchor : null}
      onClose={p.onClose}
      // PlanGrid moves focus to a cell of the task's row: the trigger may be gone after the row re-keyed
      disableRestoreFocus
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { 'aria-label': th.tasks.picker.label, role: 'dialog' } }}
    >
      <Box sx={{ p: 1.5, width: 320 }}>
        {p.taskId !== null ? (
          <AssigneePicker
            projectId={p.picker.projectId}
            taskId={p.taskId}
            projectMemberIds={p.picker.projectMemberIds}
            assignedUserIds={p.assignedUserIds}
            canManage={p.picker.canManage}
            autoFocus
            onClose={p.onClose}
          />
        ) : null}
      </Box>
    </Popover>
  )
}
