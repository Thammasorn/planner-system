'use client'
// src/components/home/RecentPagesCard.tsx — "เอกสารที่แก้ล่าสุด" (FR-1101e, M10-D17): ≤ 8 DOC pages the viewer can see;
// the relative time is computed against the response's `now` (one clock, X45).
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Link from '@/components/Link'
import { th } from '@/i18n/th'
import type { HomeRecentPage } from '@/lib/contracts/home'
import { formatRelative } from '@/lib/format'
import { HomeCard, homeItemLinkSx } from './HomeCard'

export function RecentPagesCard({ pages, now }: { pages: HomeRecentPage[]; now: string }) {
  return (
    <HomeCard id="recent-pages" title={th.home.recentPages.title}>
      {pages.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          {th.home.recentPages.empty}
        </Typography>
      ) : (
        <Box component="ul" role="list" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {pages.map((p) => (
            <Box
              component="li"
              key={p.id}
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                columnGap: 1,
                py: 1,
                minWidth: 0,
                borderBottom: '1px solid var(--border-subtle)',
                '&:last-of-type': { borderBottom: 0 },
              }}
            >
              <Box component="span" aria-hidden="true">
                {p.icon ?? '📄'}
              </Box>
              <Box
                component={Link}
                href={p.href}
                sx={homeItemLinkSx}
              >
                {p.title || th.pages.untitled}
              </Box>
              <Box component="span" sx={{ color: 'var(--text-secondary)', fontSize: 'var(--font-sm)' }}>
                {`· ${p.projectName ?? th.palette.wiki} · ${th.home.recentPages.editedBy(
                  p.updatedBy.name,
                  formatRelative(p.updatedAt, now),
                )}`}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </HomeCard>
  )
}
