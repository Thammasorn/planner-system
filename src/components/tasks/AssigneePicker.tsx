'use client'
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import { PersonPicker } from '@/components/common/PersonPicker'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { th } from '@/i18n/th'
import { useTaskMutations } from './useTaskMutations'

export interface AssigneePickerProps {
  projectId: string
  taskId: string
  projectMemberIds: ReadonlySet<string>
  assignedUserIds: ReadonlySet<string>
  /** LEAD/Manager (BR-60): everyone active, non-members hinted; MEMBER: project members only (X62). */
  canManage: boolean
  autoFocus?: boolean
  /** Popover use: Escape closes the picker in one press. */
  onClose?: () => void
}

/**
 * Assignee picker (FR-605, BR-60, AC-203): M2's PersonPicker (active people only, name/nickname/position search)
 * that stays open so several people can be added; each pick assigns at once (optimistic, undo toast).
 */
export function AssigneePicker({
  projectId,
  taskId,
  projectMemberIds,
  assignedUserIds,
  canManage,
  autoFocus,
  onClose,
}: AssigneePickerProps) {
  const people = usePeopleOptions()
  const m = useTaskMutations(projectId)
  const options = useMemo(
    () => (people.data ?? []).filter((p) => canManage || projectMemberIds.has(p.id)),
    [people.data, canManage, projectMemberIds],
  )
  return (
    <PersonPicker
      options={options}
      excludeIds={assignedUserIds}
      memberIds={canManage ? projectMemberIds : undefined}
      keepOpen
      autoFocus={autoFocus}
      onEscape={onClose}
      label={th.tasks.picker.label}
      noOptionsText={th.tasks.picker.noOptions}
      loading={people.isLoading}
      loadError={people.isError}
      onRetry={() => void people.refetch()}
      onSelect={(p) => m.assign([taskId], p.id)}
    />
  )
}

/**
 * "+ คน" button that opens the picker in a popover (rows and panel). Rows pass `tabIndex={-1}` (roving focus,
 * M3-D22): keyboard users assign from the panel (Space).
 */
export function AssigneeAddButton({
  tabIndex,
  ...props
}: Omit<AssigneePickerProps, 'autoFocus' | 'onClose'> & { tabIndex?: number | undefined }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <Button
        size="small"
        variant="text"
        {...(tabIndex !== undefined ? { tabIndex } : {})}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        sx={{ minWidth: 0, px: 1, py: 0, height: 24, flex: 'none', color: 'var(--text-secondary)' }}
      >
        {th.tasks.panel.addAssignee}
      </Button>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { 'aria-label': th.tasks.picker.label, role: 'dialog' } }}
      >
        <Box sx={{ p: 1.5, width: 320 }}>{anchor ? <AssigneePicker {...props} autoFocus onClose={() => setAnchor(null)} /> : null}</Box>
      </Popover>
    </>
  )
}
