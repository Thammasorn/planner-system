'use client'
import { useId, useState, type ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import EditOutlined from '@mui/icons-material/EditOutlined'
import Link from '@/components/Link'
import { CertaintyBadge } from '@/components/common/CertaintyBadge'
import { ColorSquare } from '@/components/common/ProjectChip'
import { th } from '@/i18n/th'
import type { ProjectHeader, ProjectOverview as ProjectOverviewData } from '@/lib/contracts/projects'
import { ArchiveProjectButton } from './ArchiveProjectButton'
import { CertaintyToggle } from './CertaintyToggle'
import { DeleteProjectButton } from './DeleteProjectButton'
import { MembersPanel } from './MembersPanel'
import { ProjectFormDialog } from './ProjectFormDialog'
import { StatusSettings } from './StatusSettings'

const EMPTY = '—'

function InfoRow({ label, labelId, children }: { label: string; labelId?: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' },
        gap: { xs: 0.25, sm: 2 },
        py: 0.75,
      }}
    >
      <Typography component="dt" id={labelId} variant="body2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Box component="dd" sx={{ m: 0, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {children}
      </Box>
    </Box>
  )
}

/** Section 1 — ข้อมูลโปรเจค (FR-409 part). No load / progress / milestones in M2 (X15). */
function ProjectInfoSection({ project }: { project: ProjectHeader }) {
  const [editing, setEditing] = useState(false)
  const headingId = useId()
  const certaintyLabelId = useId()
  return (
    <Paper variant="outlined" component="section" aria-labelledby={headingId} sx={{ p: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography id={headingId} variant="h6" component="h2">
          {th.projects.overview.infoHeading}
        </Typography>
        {project.can.manage ? (
          <Button startIcon={<EditOutlined />} onClick={() => setEditing(true)}>
            {th.projects.edit}
          </Button>
        ) : null}
      </Stack>
      <Box component="dl" sx={{ m: 0 }}>
        <InfoRow label={th.projects.fields.client}>
          {project.client ? (
            <Box component={Link} href={`/clients/${project.client.id}`} sx={{ color: 'primary.main' }}>
              {project.client.name}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {th.projects.fields.noClient}
            </Typography>
          )}
        </InfoRow>
        <InfoRow label={th.projects.fields.code}>{project.code ?? EMPTY}</InfoRow>
        <InfoRow label={th.projects.fields.color}>
          <ColorSquare color={project.color} size={14} />
          <Typography variant="body2" component="span">
            {project.color}
          </Typography>
        </InfoRow>
        <InfoRow label={th.projects.fields.certainty} labelId={certaintyLabelId}>
          {project.can.manage ? (
            <CertaintyToggle
              projectId={project.id}
              certainty={project.certainty}
              labelledBy={certaintyLabelId}
            />
          ) : (
            <>
              <CertaintyBadge certainty={project.certainty} />
              <span>{th.projects.certainty[project.certainty]}</span>
            </>
          )}
        </InfoRow>
        {project.certaintyNote ? (
          <InfoRow label={th.projects.fields.certaintyNote}>
            <Typography variant="body2" component="span" sx={{ whiteSpace: 'pre-wrap' }}>
              {project.certaintyNote}
            </Typography>
          </InfoRow>
        ) : null}
      </Box>
      {project.can.manage ? (
        <ProjectFormDialog open={editing} mode="edit" project={project} onClose={() => setEditing(false)} />
      ) : null}
    </Paper>
  )
}

/** Section 2 — BR-62 / M2-D17: shown to everyone, non-blocking. */
function NoLeadWarning() {
  return (
    <Alert severity="warning">
      <AlertTitle>{th.projects.overview.noLead}</AlertTitle>
      {th.projects.overview.noLeadHint}
    </Alert>
  )
}

/** Footer — archive / unarchive (FR-406) and permanent delete (FR-407). */
function ProjectActions({ project }: { project: ProjectHeader }) {
  const archiveAction = project.can.manage ? 'archive' : project.can.unarchive ? 'unarchive' : null
  if (!archiveAction && !project.can.delete) return null
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
      {archiveAction ? (
        <ArchiveProjectButton projectId={project.id} name={project.name} action={archiveAction} />
      ) : null}
      {project.can.delete ? <DeleteProjectButton projectId={project.id} name={project.name} /> : null}
    </Stack>
  )
}

/**
 * ภาพรวม tab (FR-409 part). Sections are a plain list so later milestones insert one line each, in milestone order:
 * M3 progress (+ status-set settings), M8 upcoming milestones, M9 per-member load + 12-week bars — always between
 * the info section and the footer.
 */
export function ProjectOverview({
  data,
  progress,
}: {
  data: ProjectOverviewData
  /** M3 FR-409 progress (M3-D21); omitted → no line. */
  progress?: { done: number; total: number } | undefined
}) {
  const { project, members, warnings } = data
  return (
    <Stack spacing={3}>
      <ProjectInfoSection project={project} />
      {warnings.noLead ? <NoLeadWarning /> : null}
      {progress ? (
        <Typography data-testid="project-progress" sx={{ fontWeight: 500 }}>
          {th.tasks.progress(progress.done, progress.total)}
        </Typography>
      ) : null}
      <MembersPanel projectId={project.id} members={members} canManage={project.can.manage} />
      {progress ? <StatusSettings projectId={project.id} /> : null}
      <ProjectActions project={project} />
    </Stack>
  )
}
