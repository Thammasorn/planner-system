'use client'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import BusinessOutlined from '@mui/icons-material/BusinessOutlined'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Link from '@/components/Link'
import { CertaintyBadge } from '@/components/common/CertaintyBadge'
import { InlineEditText } from '@/components/common/InlineEditText'
import { ColorSquare } from '@/components/common/ProjectChip'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import type { ProjectHeader } from '@/lib/contracts/projects'
import { invalidateProjects } from '@/lib/invalidate'
import { updateProject } from '@/server/actions/projects'
import { errorMessage } from './errors'
import styles from './ProjectHeaderBar.module.css'

/**
 * Project shell header (FR-408, FR-1603, M6.1 S4.4): the screen's 48 px header bar — `โปรเจค › ◼ <name>` with the name
 * as the <h1> (inline rename for managers/LEADs; the action refreshes the RSC tree, the sidebar is invalidated) — and
 * on the right ◐, the client chip and the archived chip (text, not colour only). The tab row sits directly below
 * (`flush`), the archived banner under the tabs (`ProjectArchivedBanner`). Rendered by `projects/[id]/layout.tsx`.
 * `data-testid="project-header"` stays on a box-less wrapper (M2 e2e) so the bar itself keeps `page-header`.
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
    <div data-testid="project-header" className={styles.contents}>
      <PageHeaderBar
        flush
        crumbs={[
          { label: th.nav.projects, href: '/projects' },
          {
            label: header.name,
            asHeading: true,
            icon: <ColorSquare color={header.color} size={12} />,
            content: (
              <InlineEditText
                value={header.name}
                label={th.projects.fields.name}
                onCommit={rename}
                disabled={!header.can.manage}
                maxLength={200}
                variant="subtitle1"
                component="span"
              />
            ),
          },
        ]}
        actions={
          <>
            <CertaintyBadge certainty={header.certainty} />
            {header.client ? (
              <Chip
                className={styles.client}
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
          </>
        }
      />
    </div>
  )
}

/** X42: the read-only banner of an archived project, under the tab row (text, not colour only). */
export function ProjectArchivedBanner({ archived }: { archived: boolean }) {
  return archived ? (
    <Alert severity="info" sx={{ mb: 2 }}>
      {th.projects.archivedBanner}
    </Alert>
  ) : null
}
