'use client'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Link from '@/components/Link'
import type { Certainty } from '@/domain/types'
import { th } from '@/i18n/th'
import { CertaintyBadge } from './CertaintyBadge'

export interface ProjectChipData {
  id: string
  name: string
  color: string
  certainty: Certainty
}

/** Decorative colour square (the name always sits next to it). */
export function ColorSquare({ color, size = 10 }: { color: string | null; size?: number }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-color={color ?? undefined}
      sx={{
        display: 'inline-block',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: 'var(--radius-sm)',
        bgcolor: color ?? 'transparent',
        border: color ? 'none' : '1px dashed',
        borderColor: 'divider',
      }}
    />
  )
}

/**
 * Project name with its colour square (aria-hidden), the ◐ certainty badge and an optional "archive แล้ว" chip
 * (PLAN §3.9, M2). The name is a link when `href` is given; the badges stay outside the link so its accessible name
 * is exactly the project name.
 */
export function ProjectChip({
  project,
  href,
  archived,
}: {
  project: ProjectChipData
  href?: string
  archived?: boolean
}) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <ColorSquare color={project.color} />
      {href ? (
        <Box
          component={Link}
          href={href}
          sx={{
            color: 'text.primary',
            fontWeight: 500,
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {project.name}
        </Box>
      ) : (
        <Box component="span" sx={{ fontWeight: 500 }}>
          {project.name}
        </Box>
      )}
      <CertaintyBadge certainty={project.certainty} />
      {archived ? <Chip size="small" label={th.projects.archivedChip} sx={{ height: 20 }} /> : null}
    </Box>
  )
}
