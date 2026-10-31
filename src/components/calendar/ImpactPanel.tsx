'use client'
import { useId } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { cdToNumeric } from '@/domain/units'
import { th } from '@/i18n/th'
import type { TimeOffImpact } from '@/lib/contracts/time-off'
import { formatThaiDate } from '@/lib/format'

/**
 * FR-906 capacity part (X23, M5-D5): after a leave save, every week whose capacity changed as
 * "สัปดาห์ 5 ต.ค. 2569: 5.00 → 3.00 วัน" (integer cd shown with cdToNumeric, 2 decimals), in week order; no change →
 * "ไม่กระทบ capacity". Overload lines are M9's.
 */
export function ImpactPanel({ impact }: { impact: TimeOffImpact }) {
  const titleId = useId()
  const changed = impact.weeks
    .filter((w) => w.beforeCd !== w.afterCd)
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0))
  return (
    <Box component="section" aria-labelledby={titleId} data-testid="impact-panel">
      <Typography id={titleId} variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
        {th.capacity.impactTitle}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
        {th.capacity.impactFor(impact.userName)}
      </Typography>
      {changed.length === 0 ? (
        <Typography variant="body2">{th.capacity.noImpact}</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {changed.map((w) => (
            <Typography key={w.weekStart} component="li" variant="body2">
              {th.capacity.impactLine(
                formatThaiDate(w.weekStart),
                cdToNumeric(w.beforeCd),
                cdToNumeric(w.afterCd),
              )}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  )
}
