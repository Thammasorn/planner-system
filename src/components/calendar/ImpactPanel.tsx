'use client'
import { useId } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Link from '@/components/Link'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { cdToNumeric } from '@/domain/units'
import { th } from '@/i18n/th'
import type { OverloadImpactLine, TimeOffImpact } from '@/lib/contracts/time-off'
import { formatThaiDate } from '@/lib/format'
import { twoDecimals } from '@/lib/workload/format'

/**
 * FR-906 capacity part (X23, M5-D5): after a leave save, every week whose capacity changed as
 * "สัปดาห์ 5 ต.ค. 2569: 5.00 → 3.00 วัน" (integer cd shown with cdToNumeric, 2 decimals), in week order; no change →
 * "ไม่กระทบ capacity". M9 (M9-D18, X23): below them, every week whose overload status worsened (excess, cause, the
 * projects behind it — hidden ones as งานในโปรเจคอื่น — and a link to fix it on the person grid), plus the M7-D15
 * line "มีงาน X วันวางไว้ในวันที่ลา". Shown, never fixed automatically (BR-42).
 */
export function ImpactPanel({ impact }: { impact: TimeOffImpact }) {
  const titleId = useId()
  const overloadTitleId = useId()
  const onLeaveCd = impact.onTimeOffDays.reduce((sum, d) => sum + d.cd, 0)
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
        <Box component="ul" sx={{ m: 0, pl: 3 }}>
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
      {onLeaveCd > 0 ? (
        <Typography variant="body2" sx={{ mt: 1 }} data-testid="impact-on-leave">
          {th.grid.warn.allocatedOnTimeOff(twoDecimals(onLeaveCd))}
        </Typography>
      ) : null}
      {impact.overloads.length > 0 ? (
        <Box
          component="section"
          aria-labelledby={overloadTitleId}
          sx={{ mt: 2 }}
          data-testid="impact-overloads"
        >
          <Typography id={overloadTitleId} variant="subtitle2" component="h4" sx={{ fontWeight: 600 }}>
            {th.overload.impact.heading}
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 3 }}>
            {impact.overloads.map((line) => (
              <OverloadLine key={line.week} line={line} />
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}

function OverloadLine({ line }: { line: OverloadImpactLine }) {
  const week = formatThaiDate(line.week)
  const level = th.overload.level[line.after.level]
  const text =
    line.before.level === line.after.level
      ? th.overload.impact.worse(
          week,
          level,
          twoDecimals(line.before.excessCd),
          twoDecimals(line.after.excessCd),
        )
      : th.overload.impact.line(
          week,
          level,
          th.overload.excess(twoDecimals(line.after.excessCd)),
          th.overload.cause[line.after.cause],
        )
  return (
    <Box component="li" sx={{ mb: 0.5 }} data-week={line.week}>
      <Typography
        variant="body2"
        component="span"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
      >
        <StatusGlyph kind={line.after.level === 'OVER' ? 'over' : 'risk'} label={level} />
        <span>{text}</span>
      </Typography>{' '}
      <Link href={line.href}>{th.overload.impact.fix}</Link>
      {line.parts.length > 0 ? (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', m: 0 }}>
          {line.parts.map((p, i) => (
            <span key={p.projectId ?? 'masked'}>
              {i > 0 ? ' · ' : null}
              <span>{th.overload.impact.part(p.name, twoDecimals(p.load.total))}</span>
            </span>
          ))}
        </Typography>
      ) : null}
    </Box>
  )
}
