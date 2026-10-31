'use client'
import { useState, useTransition } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined'
import { EmptyState } from '@/components/common/EmptyState'
import { ColorSquare } from '@/components/common/ProjectChip'
import { ProjectsTable } from '@/components/projects/ProjectsTable'
import { th } from '@/i18n/th'
import type { ClientDetail } from '@/lib/contracts/clients'
import { ClientFormDialog } from './ClientFormDialog'
import { useClientArchive } from './useClientArchive'

/**
 * `/clients/[id]` (FR-303 part): header + the client's projects the viewer can see. No load figure until M9 (X15).
 * Managers edit / archive (undo toast) / unarchive here too.
 */
export function ClientDetailView({ detail }: { detail: ClientDetail }) {
  const { client, projects, can } = detail
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const { archive, unarchive } = useClientArchive()
  const toggle = () =>
    startTransition(async () => {
      await (client.archived ? unarchive(client) : archive(client)).catch(() => {}) // already toasted
    })

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          <ColorSquare color={client.color} size={16} />
          <Typography variant="h4" component="h1">
            {client.name}
          </Typography>
          {client.code ? <Chip size="small" variant="outlined" label={client.code} /> : null}
          {client.archived ? <Chip size="small" label={th.clients.archivedChip} /> : null}
          <Box sx={{ flex: 1 }} />
          {can.manage ? (
            <Stack direction="row" spacing={1}>
              <Button startIcon={<EditOutlined />} onClick={() => setEditing(true)}>
                {th.clients.edit}
              </Button>
              <Button
                variant="outlined"
                startIcon={client.archived ? <UnarchiveOutlined /> : <ArchiveOutlined />}
                // Not `disabled` while pending: that drops keyboard focus to <body> (SPEC §8.9, KEY-03).
                aria-disabled={pending || undefined}
                onClick={() => {
                  if (!pending) toggle()
                }}
              >
                {client.archived ? th.clients.unarchive : th.clients.archive}
              </Button>
            </Stack>
          ) : null}
        </Stack>
        {client.note ? (
          <Typography sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}>{client.note}</Typography>
        ) : null}
      </Stack>
      <Stack spacing={1.5}>
        <Typography variant="h6" component="h2">
          {th.clients.projectsHeading}
        </Typography>
        {projects.length === 0 ? (
          <EmptyState title={th.clients.noProjects} />
        ) : (
          <ProjectsTable items={projects} label={th.clients.projectsHeading} />
        )}
      </Stack>
      {can.manage ? (
        <ClientFormDialog open={editing} mode="edit" client={client} onClose={() => setEditing(false)} />
      ) : null}
    </Stack>
  )
}
