'use client'
// src/components/home/LeaveCard.tsx — "ใครลา" (FR-1101d, X68, M10-D16): three lines วันนี้ / สัปดาห์นี้ / สัปดาห์หน้า as a
// description list; masked entries (MASK-5, X60b) show only who, when and "ลา" — never a type.
import Box from '@mui/material/Box'
import { th } from '@/i18n/th'
import type { HomeLeave, HomeLeaveEntry } from '@/lib/contracts/home'
import { formatLeaveRange } from '@/lib/format'
import { HomeCard } from './HomeCard'

function entryText(e: HomeLeaveEntry): string {
  const base = th.home.leave.entry(e.name, formatLeaveRange(e.entry.startDate, e.entry.endDate, e.entry.half))
  return e.entry.kind === 'full' ? `${base} · ${e.entry.leaveTypeName}` : `${base} · ${e.entry.label}`
}

const LINES = ['today', 'thisWeek', 'nextWeek'] as const

export function LeaveCard({ leave }: { leave: HomeLeave }) {
  return (
    <HomeCard id="leave" title={th.home.leave.title}>
      <Box
        component="dl"
        sx={{
          display: 'grid',
          gridTemplateColumns: 'max-content minmax(0, 1fr)',
          columnGap: 2,
          rowGap: 1,
          m: 0,
        }}
      >
        {LINES.map((key) => (
          <Box key={key} sx={{ display: 'contents' }} data-leave-line={key}>
            <Box component="dt" sx={{ color: 'var(--text-secondary)', fontSize: 'var(--font-sm)' }}>
              {th.home.leave[key]}
            </Box>
            <Box component="dd" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
              {leave[key].length === 0 ? (
                th.home.leave.none
              ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                  {leave[key].map((e) => (
                    <li key={`${e.userId}:${e.entry.startDate}:${e.entry.half ?? ''}`}>{entryText(e)}</li>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </HomeCard>
  )
}
