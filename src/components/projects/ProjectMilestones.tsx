'use client'
// src/components/projects/ProjectMilestones.tsx — overview section "Milestones" (plan/m08 S4.2, FR-409/702/703/708,
// M8-D17). Client component over GET /api/projects/[id]/milestones so mutations update it through TanStack. Order:
// not-DONE by date, then DONE by date (struck through). M/L (canManage): add / edit inline, complete, delete (no
// confirm, undo toast from the hook); others read only.
import { useId, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddOutlined from '@mui/icons-material/AddOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import { MilestoneForm } from '@/components/milestones/MilestoneForm'
import { MilestoneLateBadge, MilestoneStatusChip } from '@/components/milestones/MilestoneStatusChip'
import { useMilestoneMutations } from '@/components/milestones/useMilestoneMutations'
import { useProjectMilestones } from '@/components/milestones/useProjectMilestones'
import { compareMilestones } from '@/domain/milestone'
import { milestoneColorVar } from '@/lib/theme/tokens'
import { th } from '@/i18n/th'
import type { MilestoneDTO } from '@/lib/contracts/milestones'
import { formatThaiDate } from '@/lib/format'
import type { MilestonePatch } from '@/lib/schemas/milestones'

/** M8-D17: not-DONE by date then id, then DONE by date then id. */
export function overviewOrder(ms: readonly MilestoneDTO[]): MilestoneDTO[] {
  const open = ms.filter((m) => m.status !== 'DONE').sort(compareMilestones)
  const done = ms.filter((m) => m.status === 'DONE').sort(compareMilestones)
  return [...open, ...done]
}

function MilestoneRow({ m, canManage, onEdit }: { m: MilestoneDTO; canManage: boolean; onEdit: () => void }) {
  const ms = useMilestoneMutations()
  const done = m.status === 'DONE'
  return (
    <Stack
      role="listitem"
      direction="row"
      spacing={1}
      data-milestone-id={m.id}
      data-status={m.status}
      sx={{ alignItems: 'flex-start', py: 1, borderBottom: '1px solid var(--border-subtle)' }}
    >
      {canManage ? (
        <Checkbox
          size="small"
          checked={done}
          onChange={() => void ms.update(m, { completed: !done })}
          slotProps={{ input: { 'aria-label': th.milestones.overview.completeToggle(m.name) } }}
          sx={{ p: 0.5 }}
        />
      ) : null}
      <Box
        aria-hidden="true"
        data-color={m.color}
        title={th.milestones.color.named(th.milestones.color.name[m.color])}
        sx={{ color: milestoneColorVar(m.color), pt: 0.5 }}
      >
        {th.milestones.diamond}
      </Box>
      <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography
            data-testid="milestone-name"
            variant="body2"
            sx={{ fontWeight: 600, textDecoration: done ? 'line-through' : 'none' }}
          >
            {m.name}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {formatThaiDate(m.date, 'medium')}
          </Typography>
          <MilestoneStatusChip status={m.status} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {th.milestones.progress(m.progress.done, m.progress.total)}
          </Typography>
          {m.late ? (
            <MilestoneLateBadge
              count={m.lateTaskCount}
              hint={th.milestones.lateHint(formatThaiDate(m.date))}
            />
          ) : null}
        </Stack>
        {m.description ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}>
            {m.description}
          </Typography>
        ) : null}
      </Stack>
      {canManage ? (
        <Stack direction="row" spacing={0.5}>
          <IconButton size="small" aria-label={th.milestones.overview.edit(m.name)} onClick={onEdit}>
            <EditOutlined fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={th.milestones.overview.remove(m.name)}
            onClick={() => void ms.remove(m)}
          >
            <DeleteOutlined fontSize="small" />
          </IconButton>
        </Stack>
      ) : null}
    </Stack>
  )
}

/** Only the fields that differ from the milestone (no-op when none). */
function changedPatch(
  m: MilestoneDTO,
  v: { name: string; date: string; description: string | null; color: MilestoneDTO['color'] },
): MilestonePatch {
  const p: MilestonePatch = {}
  if (v.name !== m.name) p.name = v.name
  if (v.date !== m.date) p.date = v.date
  if ((v.description ?? null) !== (m.description ?? null)) p.description = v.description
  if (v.color !== m.color) p.color = v.color // M11.1 (FR-709)
  return p
}

export function ProjectMilestones({ projectId }: { projectId: string }) {
  const headingId = useId()
  const q = useProjectMilestones(projectId)
  const ms = useMilestoneMutations()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const rows = useMemo(() => overviewOrder(q.data?.milestones ?? []), [q.data])
  const canManage = q.data?.canManage ?? false

  return (
    <Box component="section" aria-labelledby={headingId} data-testid="project-milestones">
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography id={headingId} variant="h4" component="h2">
          {th.milestones.heading}
        </Typography>
        {canManage && !adding ? (
          <Button startIcon={<AddOutlined />} onClick={() => setAdding(true)}>
            {th.milestones.overview.add}
          </Button>
        ) : null}
      </Stack>
      {q.data && !canManage ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
          {th.milestones.overview.readOnly}
        </Typography>
      ) : null}
      {adding ? (
        <Box sx={{ mb: 2, maxWidth: 480 }}>
          <MilestoneForm
            initial={{ name: '', date: null, description: '' }}
            submitLabel={th.milestones.form.create}
            onCancel={() => setAdding(false)}
            onSubmit={(v) => {
              void ms
                .create({ projectId, name: v.name, date: v.date, description: v.description, color: v.color })
                .then((m) => {
                  if (m) setAdding(false)
                })
            }}
          />
        </Box>
      ) : null}
      {q.isPending ? (
        <Typography role="status" variant="body2" sx={{ color: 'text.secondary' }}>
          {th.common.loading}
        </Typography>
      ) : null}
      {q.isError && !q.data ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void q.refetch()}>
              {th.common.retry}
            </Button>
          }
        >
          {th.milestones.overview.loadError}
        </Alert>
      ) : null}
      {q.data && rows.length === 0 && !adding ? (
        // compact, left-aligned: the section sits inside the overview page (no centred py:6 block)
        <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }} data-testid="milestones-empty">
          {th.milestones.overview.empty}
        </Typography>
      ) : null}
      {rows.length > 0 ? (
        <Box role="list" aria-label={th.milestones.overview.listLabel}>
          {rows.map((m) =>
            editingId === m.id && canManage ? (
              <Box role="listitem" key={m.id} sx={{ py: 1, maxWidth: 480 }}>
                <MilestoneForm
                  initial={{ name: m.name, date: m.date, description: m.description ?? '', color: m.color }}
                  submitLabel={th.milestones.form.save}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(v) => {
                    setEditingId(null)
                    const patch = changedPatch(m, v)
                    if (Object.keys(patch).length > 0) void ms.update(m, patch)
                  }}
                />
              </Box>
            ) : (
              <MilestoneRow key={m.id} m={m} canManage={canManage} onEdit={() => setEditingId(m.id)} />
            ),
          )}
        </Box>
      ) : null}
    </Box>
  )
}
