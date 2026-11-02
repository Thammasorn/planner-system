'use client'
import { Fragment, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import Link from '@/components/Link'
import { CertaintyBadge } from '@/components/common/CertaintyBadge'
import { ProjectChip } from '@/components/common/ProjectChip'
import { UserName } from '@/components/common/UserName'
import { th } from '@/i18n/th'
import type { LoadPair } from '@/domain/types'
import type { ProjectListItem } from '@/lib/contracts/projects'
import { twoDecimals } from '@/lib/workload/format'
import { projectTabHref } from './project-tabs'

interface Column {
  id: string
  label: string
  render: (p: ProjectListItem) => ReactNode
}

/** Columns are a list so later milestones add one entry (M9: load per project on the client page). */
const COLUMNS: readonly Column[] = [
  {
    id: 'name',
    label: th.projects.columns.name,
    render: (p) => <ProjectChip project={p} href={projectTabHref(p.id, 'overview')} archived={p.archived} />,
  },
  {
    id: 'client',
    label: th.projects.columns.client,
    render: (p) =>
      p.client ? (
        <Box component="span" sx={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>
          <Box component={Link} href={`/clients/${p.client.id}`} sx={{ color: 'text.primary' }}>
            {p.client.name}
          </Box>
          {p.client.archived ? (
            <Chip size="small" label={th.clients.archivedChip} sx={{ height: 20 }} />
          ) : null}
        </Box>
      ) : null,
  },
  {
    id: 'leads',
    label: th.projects.columns.leads,
    render: (p) =>
      p.leads.length === 0 ? (
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
          {th.projects.overview.noLead}
        </Typography>
      ) : (
        p.leads.map((l, i) => (
          <Fragment key={l.userId}>
            {i > 0 ? ', ' : null}
            <UserName user={l} />
          </Fragment>
        ))
      ),
  },
  {
    id: 'members',
    label: th.projects.columns.members,
    render: (p) => th.projects.memberCount(p.memberCount),
  },
  {
    id: 'certainty',
    label: th.projects.columns.certainty,
    render: (p) => (
      <Box component="span" sx={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>
        <CertaintyBadge certainty={p.certainty} />
        <span>{th.projects.certainty[p.certainty]}</span>
      </Box>
    ),
  },
]

/** M9 FR-303 load part (M9-D20): the 12-week load column, only on the client page; "–" when 0 or absent. */
function loadColumn(loadByProject: Record<string, LoadPair>): Column {
  return {
    id: 'load',
    label: th.workload.clientLoad.column,
    render: (p) => {
      const cd = loadByProject[p.id]?.total ?? 0
      return cd === 0 ? th.workload.cell.empty : th.workload.tooltip.days(twoDecimals(cd))
    },
  }
}

/** `/projects` and client-detail project list (FR-303 part). Rows arrive sorted by compareThai from the server.
 *  `loadByProject` (M9, client page only) adds the "ภาระ 12 สัปดาห์" column last; `/projects` passes nothing. */
export function ProjectsTable({
  items,
  label,
  loadByProject,
}: {
  items: ProjectListItem[]
  label?: string
  loadByProject?: Record<string, LoadPair>
}) {
  const columns = loadByProject ? [...COLUMNS, loadColumn(loadByProject)] : COLUMNS
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={label ?? th.projects.listTitle}>
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c.id}>{c.label}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id} data-testid={`project-row-${p.id}`} hover>
              {columns.map((c) => (
                <TableCell key={c.id} data-col={c.id}>
                  {c.render(p)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
