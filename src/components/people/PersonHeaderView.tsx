'use client'
// src/components/people/PersonHeaderView.tsx — the person page header (FR-1008, M9-D14): the 48 px PageHeaderBar
// (ทีมงาน › name as the <h1>) + one line of facts: full name when different, position, work schedule and the
// "ปิดใช้งาน" chip (text, not colour). No email.
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { PageHeaderBar } from '@/components/layout/PageHeaderBar'
import { th } from '@/i18n/th'
import type { PersonHeader } from '@/lib/contracts/workload'
import { formatSchedule } from '@/lib/people/schedule'

export function PersonHeaderView({ header }: { header: PersonHeader }) {
  const h = th.people.header
  return (
    <>
      <PageHeaderBar
        flush
        crumbs={[
          { label: th.people.title, href: '/people' },
          { label: header.name, asHeading: true },
        ]}
      />
      <Box
        data-testid="person-header"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 2,
          rowGap: 0.5,
          mt: 1,
          mb: 1,
        }}
      >
        {header.fullName !== header.name ? (
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
            {h.fullName(header.fullName)}
          </Typography>
        ) : null}
        <Typography variant="body2" data-testid="person-position">
          <Box component="span" sx={{ color: 'var(--text-secondary)' }}>
            {`${h.position}: `}
          </Box>
          {header.positionName ?? h.noPosition}
        </Typography>
        <Typography variant="body2" data-testid="person-schedule">
          <Box component="span" sx={{ color: 'var(--text-secondary)' }}>
            {`${h.schedule}: `}
          </Box>
          {formatSchedule(header.schedule)}
        </Typography>
        {header.active ? null : <Chip size="small" variant="outlined" label={h.deactivated} />}
      </Box>
    </>
  )
}
