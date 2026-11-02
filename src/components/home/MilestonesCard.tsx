'use client'
// src/components/home/MilestonesCard.tsx — "Milestone 14 วันข้างหน้า" (FR-1101c, FR-705 home part, M10-D15): visible,
// non-archived projects only (server); overdue first; M8's status chip (icon + text) and late badge.
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Link from '@/components/Link'
import { ColorSquare } from '@/components/common/ProjectChip'
import { MilestoneLateBadge, MilestoneStatusChip } from '@/components/milestones/MilestoneStatusChip'
import { th } from '@/i18n/th'
import type { HomeMilestone } from '@/lib/contracts/home'
import { formatThaiDate } from '@/lib/format'
import { HomeCard } from './HomeCard'

export function MilestonesCard({ milestones }: { milestones: HomeMilestone[] }) {
  return (
    <HomeCard id="milestones" title={th.home.milestones.title}>
      {milestones.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          {th.home.milestones.empty}
        </Typography>
      ) : (
        <Box component="ul" role="list" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {milestones.map((m) => (
            <Box
              component="li"
              key={m.id}
              data-milestone-id={m.id}
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 1,
                py: 1,
                minWidth: 0,
                borderBottom: '1px solid var(--border-subtle)',
                '&:last-of-type': { borderBottom: 0 },
              }}
            >
              <Box component="span" aria-hidden="true" sx={{ color: 'var(--text-secondary)' }}>
                ◆
              </Box>
              <Box component="span" sx={{ fontSize: 'var(--font-sm)', whiteSpace: 'nowrap' }}>
                {formatThaiDate(m.date, 'medium')}
              </Box>
              <Box
                component={Link}
                href={`/projects/${m.projectId}/overview`}
                sx={{ color: 'text.primary', fontWeight: 'var(--weight-medium)', overflowWrap: 'anywhere' }}
              >
                {m.name}
              </Box>
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  fontSize: 'var(--font-sm)',
                  color: 'var(--text-secondary)',
                }}
              >
                <ColorSquare color={m.projectColor} />
                {m.projectName}
              </Box>
              <MilestoneStatusChip status={m.status} />
              {m.late ? <MilestoneLateBadge /> : null}
            </Box>
          ))}
        </Box>
      )}
    </HomeCard>
  )
}
