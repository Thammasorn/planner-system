'use client'
import { useId, useState } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import EditOutlined from '@mui/icons-material/EditOutlined'
import Link from '@/components/Link'
import { CertaintyBadge } from '@/components/common/CertaintyBadge'
import { ColorSquare } from '@/components/common/ProjectChip'
import { PropertyList, PropertyRow } from '@/components/layout/PropertyList'
import { th } from '@/i18n/th'
import type { ProjectHeader, ProjectOverview as ProjectOverviewData } from '@/lib/contracts/projects'
import { ArchiveProjectButton } from './ArchiveProjectButton'
import { CertaintyToggle } from './CertaintyToggle'
import { DeleteProjectButton } from './DeleteProjectButton'
import { MembersPanel } from './MembersPanel'
import { ProjectFormDialog } from './ProjectFormDialog'
import { ProjectLoadSection } from './ProjectLoadSection'
import { ProjectMilestones } from './ProjectMilestones'
import { StatusSettings } from './StatusSettings'

const EMPTY = '—'

/** Section 1 — ข้อมูลโปรเจค (FR-409 part). */
function ProjectInfoSection({ project }: { project: ProjectHeader }) {
  const [editing, setEditing] = useState(false)
  const headingId = useId()
  const certaintyId = useId()
  return (
    <Box component="section" aria-labelledby={headingId}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography id={headingId} variant="h4" component="h2">
          {th.projects.overview.infoHeading}
        </Typography>
        {project.can.manage ? (
          <Button startIcon={<EditOutlined />} onClick={() => setEditing(true)}>
            {th.projects.edit}
          </Button>
        ) : null}
      </Stack>
      {/* FR-1604 light rows: read-only values; edits go through the (restyled) edit dialog (M6.1-D23) */}
      <PropertyList aria-label={th.projects.overview.infoHeading}>
        <PropertyRow label={th.projects.fields.client}>
          {project.client ? (
            <Box component={Link} href={`/clients/${project.client.id}`} sx={{ color: 'primary.main' }}>
              {project.client.name}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {th.projects.fields.noClient}
            </Typography>
          )}
        </PropertyRow>
        <PropertyRow label={th.projects.fields.code}>{project.code ?? EMPTY}</PropertyRow>
        <PropertyRow label={th.projects.fields.color}>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <ColorSquare color={project.color} size={14} />
            <Typography variant="body2" component="span">
              {project.color}
            </Typography>
          </Box>
        </PropertyRow>
        <PropertyRow label={th.projects.fields.certainty} id={certaintyId}>
          {project.can.manage ? (
            <CertaintyToggle
              projectId={project.id}
              certainty={project.certainty}
              labelledBy={`${certaintyId}-label`}
            />
          ) : (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <CertaintyBadge certainty={project.certainty} />
              <span>{th.projects.certainty[project.certainty]}</span>
            </Box>
          )}
        </PropertyRow>
        {project.certaintyNote ? (
          <PropertyRow label={th.projects.fields.certaintyNote}>
            <Typography variant="body2" component="span" sx={{ whiteSpace: 'pre-wrap' }}>
              {project.certaintyNote}
            </Typography>
          </PropertyRow>
        ) : null}
      </PropertyList>
      {project.can.manage ? (
        <ProjectFormDialog open={editing} mode="edit" project={project} onClose={() => setEditing(false)} />
      ) : null}
    </Box>
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
      {/* M8 FR-409 milestones (M8-D17): after the info card, before the status settings */}
      <ProjectMilestones projectId={project.id} />
      <MembersPanel projectId={project.id} members={members} canManage={project.can.manage} />
      {progress ? <StatusSettings projectId={project.id} /> : null}
      {/* M9 FR-409 load part (M9-D19, C41): appended last, before the footer actions */}
      <ProjectLoadSection projectId={project.id} />
      <ProjectActions project={project} />
    </Stack>
  )
}
