'use client'
// src/components/home/ManagerCards.tsx — manager-only cards (FR-1101f, PRIN-P6, M10-D18, X67): who is OVER/RISK this
// week and next (one click to the person's plan, one to /workload) and the team utilisation over 4 weeks.
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Link from '@/components/Link'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { isDeactivatedWeek } from '@/components/workload/WorkloadCell'
import { th } from '@/i18n/th'
import type { HomeManagerCards, HomeUtilisationWeek } from '@/lib/contracts/home'
import { formatWeekHeader } from '@/lib/format'
import { formatPercentTenths } from '@/lib/home/percent'
import { causeText, compactDays } from '@/lib/workload/format'
import { HomeCard, homeActionLinkSx, homeItemLinkSx } from './HomeCard'

export function ManagerOverloadCard({ overloaded }: { overloaded: HomeManagerCards['overloaded'] }) {
  return (
    <HomeCard
      id="manager-overload"
      title={th.home.manager.overloadedTitle}
      action={
        <Box component={Link} href="/workload" sx={homeActionLinkSx}>
          {th.home.manager.openWorkload}
        </Box>
      }
    >
      {overloaded.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          {th.home.manager.overloadedEmpty}
        </Typography>
      ) : (
        <Box component="ul" role="list" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {overloaded.map((o) => (
            <Box
              component="li"
              key={`${o.userId}:${o.week}`}
              data-level={o.level}
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                columnGap: 1,
                py: 1,
                minWidth: 0,
                borderBottom: '1px solid var(--border-subtle)',
                '&:last-of-type': { borderBottom: 0 },
              }}
            >
              <Box
                component={Link}
                href={o.href}
                sx={homeItemLinkSx}
              >
                {o.name}
              </Box>
              <span>{th.home.manager.week(formatWeekHeader(o.week))}</span>
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <StatusGlyph kind={o.level === 'OVER' ? 'over' : 'risk'} label="" />
                {th.overload.level[o.level]}
              </Box>
              <span>{th.overload.excess(compactDays(o.excess))}</span>
              <Box component="span" sx={{ color: 'var(--text-secondary)', fontSize: 'var(--font-sm)' }}>
                {causeText(o.cause, isDeactivatedWeek(o.deactivatedOn, o.week))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </HomeCard>
  )
}

function UtilisationCells({ w }: { w: HomeUtilisationWeek }) {
  return (
    <>
      <Box component="td" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {formatPercentTenths(w.percentTenths)}
      </Box>
      <Box
        component="td"
        sx={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: 'var(--font-sm)' }}
      >
        {th.home.manager.committed(formatPercentTenths(w.committedPercentTenths))}
      </Box>
    </>
  )
}

export function ManagerUtilisationCard({ utilisation }: { utilisation: HomeManagerCards['utilisation'] }) {
  const cell = { py: 0.5, px: 1, borderBottom: '1px solid var(--border-subtle)' } as const
  return (
    <HomeCard id="manager-utilisation" title={th.home.manager.utilisationTitle}>
      <Box
        component="table"
        sx={{ width: '100%', borderCollapse: 'collapse', '& th, & td': cell, '& th': { textAlign: 'left' } }}
      >
        <tbody>
          {utilisation.weeks.map((w) => (
            <tr key={w.week} data-week={w.week}>
              <Box component="th" scope="row" sx={{ fontWeight: 'var(--weight-regular)' }}>
                {th.home.manager.week(formatWeekHeader(w.week))}
              </Box>
              <UtilisationCells w={w} />
            </tr>
          ))}
          <tr data-total="">
            <Box component="th" scope="row" sx={{ fontWeight: 'var(--weight-bold)' }}>
              {th.home.manager.utilisationTotal}
            </Box>
            <UtilisationCells w={utilisation.total} />
          </tr>
        </tbody>
      </Box>
    </HomeCard>
  )
}
