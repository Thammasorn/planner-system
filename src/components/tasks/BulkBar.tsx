'use client'
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Popover from '@mui/material/Popover'
import Typography from '@mui/material/Typography'
import { PersonPicker } from '@/components/common/PersonPicker'
import { compareMilestones } from '@/domain/milestone'
import { usePeopleOptions } from '@/hooks/usePeopleOptions'
import { th } from '@/i18n/th'
import type { MilestoneRef } from '@/lib/contracts/milestones'
import type { TaskStatusDTO } from '@/lib/contracts/tasks'
import { formatThaiDate } from '@/lib/format'
import { StatusMenu } from './status/StatusMenu'

/**
 * Multi-select actions (FR-614, M3-D23): ติ๊กเสร็จ · เปลี่ยนสถานะ · มอบหมาย · ผูก milestone (M8-D14: milestones in date
 * order + ไม่ผูก, shown when `onLinkMilestone` is given) · ลบ · ยกเลิกการเลือก. Visible from 2 selected rows.
 */
export function BulkBar({
  count,
  statuses,
  canEdit,
  canManage,
  memberIds,
  onComplete,
  onSetStatus,
  onAssign,
  onDelete,
  onClear,
  milestones = [],
  onLinkMilestone,
}: {
  count: number
  statuses: readonly TaskStatusDTO[]
  canEdit: boolean
  canManage: boolean
  memberIds: ReadonlySet<string>
  onComplete: () => void
  onSetStatus: (statusId: string) => void
  onAssign: (userId: string) => void
  onDelete: () => void
  onClear: () => void
  /** M8: the project's live milestones. */
  milestones?: readonly MilestoneRef[]
  /** M8 (FR-614): bind every selected task (any depth) to the milestone, or unbind with null. */
  onLinkMilestone?: (m: MilestoneRef | null) => void
}) {
  const [milestoneAnchor, setMilestoneAnchor] = useState<HTMLElement | null>(null)
  const sortedMilestones = useMemo(() => [...milestones].sort(compareMilestones), [milestones])
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null)
  const [assignAnchor, setAssignAnchor] = useState<HTMLElement | null>(null)
  const people = usePeopleOptions({ enabled: canEdit })
  const options = useMemo(
    () => (people.data ?? []).filter((p) => canManage || memberIds.has(p.id)),
    [people.data, canManage, memberIds],
  )
  return (
    <Box
      role="toolbar"
      aria-label={th.tasks.bulk.selected(count)}
      sx={{
        position: 'sticky',
        bottom: 8,
        zIndex: 2,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1,
        mt: 1,
        p: 1,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: 3,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>
        {th.tasks.bulk.selected(count)}
      </Typography>
      {canEdit ? (
        <>
          <Button size="small" onClick={onComplete}>
            {th.tasks.bulk.complete}
          </Button>
          <Button size="small" aria-haspopup="dialog" onClick={(e) => setStatusAnchor(e.currentTarget)}>
            {th.tasks.bulk.setStatus}
          </Button>
          <Button size="small" aria-haspopup="dialog" onClick={(e) => setAssignAnchor(e.currentTarget)}>
            {th.tasks.bulk.assign}
          </Button>
          {onLinkMilestone ? (
            <Button size="small" aria-haspopup="menu" onClick={(e) => setMilestoneAnchor(e.currentTarget)}>
              {th.milestones.tasks.bulkLink}
            </Button>
          ) : null}
          <Button size="small" color="error" onClick={onDelete}>
            {th.tasks.bulk.delete}
          </Button>
        </>
      ) : null}
      <Button size="small" onClick={onClear}>
        {th.tasks.bulk.clear}
      </Button>
      <Menu
        anchorEl={milestoneAnchor}
        open={milestoneAnchor !== null}
        onClose={() => setMilestoneAnchor(null)}
        slotProps={{ list: { 'aria-label': th.milestones.tasks.bulkLink } }}
      >
        {sortedMilestones.map((x) => (
          <MenuItem
            key={x.id}
            onClick={() => {
              setMilestoneAnchor(null)
              onLinkMilestone?.(x)
            }}
          >
            {th.milestones.tasks.groupHeader(x.name, formatThaiDate(x.date))}
          </MenuItem>
        ))}
        <MenuItem
          onClick={() => {
            setMilestoneAnchor(null)
            onLinkMilestone?.(null)
          }}
        >
          {th.milestones.none}
        </MenuItem>
      </Menu>
      <StatusMenu
        statuses={statuses}
        currentId={null}
        anchorEl={statusAnchor}
        onPick={onSetStatus}
        onClose={() => setStatusAnchor(null)}
      />
      <Popover
        open={assignAnchor !== null}
        anchorEl={assignAnchor}
        onClose={() => setAssignAnchor(null)}
        slotProps={{ paper: { 'aria-label': th.tasks.picker.label, role: 'dialog' } }}
      >
        <Box sx={{ p: 1.5, width: 320 }}>
          {assignAnchor ? (
            <PersonPicker
              options={options}
              memberIds={canManage ? memberIds : undefined}
              autoFocus
              label={th.tasks.picker.label}
              noOptionsText={th.tasks.picker.noOptions}
              loading={people.isLoading}
              onSelect={(p) => {
                setAssignAnchor(null)
                onAssign(p.id)
              }}
            />
          ) : null}
        </Box>
      </Popover>
    </Box>
  )
}
