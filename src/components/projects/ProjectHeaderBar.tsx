'use client'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import BusinessOutlined from '@mui/icons-material/BusinessOutlined'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from '@/components/Link'
import { CertaintyBadge } from '@/components/common/CertaintyBadge'
import { InlineEditText } from '@/components/common/InlineEditText'
import { ColorSquare } from '@/components/common/ProjectChip'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import type { ProjectHeader } from '@/lib/contracts/projects'
import { invalidateProjects } from '@/lib/invalidate'
import { updateProject } from '@/server/actions/projects'
import { errorMessage } from './errors'

/**
 * Project page header (FR-408 shell): colour, name (inline rename for managers/LEADs — the action refreshes the RSC
 * tree, the sidebar is invalidated), ◐, client chip and the read-only banner for archived projects (X42; text, not
 * colour only). Rendered by `projects/[id]/layout.tsx` above every tab.
 */
export function ProjectHeaderBar({ header }: { header: ProjectHeader }) {
  const qc = useQueryClient()
  const rename = async (name: string) => {
    try {
      await unwrap(updateProject({ projectId: header.id, name }))
      toast.success(th.projects.toasts.saved)
      await invalidateProjects(qc)
    } catch (err) {
      toast.error(errorMessage(err))
      throw err
    }
  }
  return (
    <Stack spacing={1.5} sx={{ mb: 1 }} data-testid="project-header">
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <ColorSquare color={header.color} size={16} />
        <Box sx={{ minWidth: 0, flex: '0 1 auto' }}>
          <InlineEditText
            value={header.name}
            label={th.projects.fields.name}
            onCommit={rename}
            disabled={!header.can.manage}
            maxLength={200}
            variant="h4"
            component="h1"
          />
        </Box>
        <CertaintyBadge certainty={header.certainty} />
        {header.client ? (
          <Chip
            icon={<BusinessOutlined />}
            label={header.client.name}
            component={Link}
            href={`/clients/${header.client.id}`}
            clickable
            variant="outlined"
            size="small"
          />
        ) : null}
        {header.client?.archived ? (
          <Chip size="small" label={th.clients.archivedChip} data-testid="client-archived-chip" />
        ) : null}
        {header.archived ? <Chip size="small" label={th.projects.archivedChip} /> : null}
      </Stack>
      {header.archived ? <Alert severity="info">{th.projects.archivedBanner}</Alert> : null}
    </Stack>
  )
}
