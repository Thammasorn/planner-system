'use client'
// src/components/projects/ProjectLoadSection.tsx — FR-409 load part on the overview (M9-D19, X15, X42): each member's
// load in this project (this week + 12-week sum, days — M9-D21) and 12 weekly bars of the project total; the
// tentative part is hatched and every bar has a text label (never colour alone). Archived → the "ไม่นับภาระ" note.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { useProjectLoad } from '@/hooks/useWorkload'
import { th } from '@/i18n/th'
import type { ProjectLoadResponse } from '@/lib/contracts/workload'
import { formatWeekHeader } from '@/lib/format'
import { twoDecimals } from '@/lib/workload/format'
import { errorMessage } from './errors'
import styles from './ProjectLoad.module.css'

function Bars({ data }: { data: ProjectLoadResponse }) {
  const t = th.workload.projectLoad
  const max = Math.max(1, ...data.weeks.map((w) => data.weekly[w]?.total ?? 0))
  return (
    <Box>
      {/* bars and week labels scroll together, so 12 columns never widen the page at 390 px */}
      <div className={styles.scroll}>
        <div className={styles.bars} role="list" aria-label={t.barsLabel} data-testid="project-load-bars">
          {data.weeks.map((w) => {
            const load = data.weekly[w] ?? { total: 0, committed: 0 }
            // display only: bar heights in % of the largest week (the numbers themselves stay integer cd)
            const committedPct = (load.committed * 100) / max
            const tentativePct = ((load.total - load.committed) * 100) / max
            return (
              <div
                key={w}
                role="listitem"
                className={styles.barCol}
                data-week={w}
                aria-label={t.bar(formatWeekHeader(w), twoDecimals(load.total), twoDecimals(load.committed))}
              >
                <div className={styles.bar} aria-hidden="true">
                  <div className={styles.committed} style={{ height: `${committedPct}%` }} />
                  <div className={styles.tentative} style={{ height: `${tentativePct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
        <div className={styles.labels} aria-hidden="true">
          {data.weeks.map((w) => (
            <span key={w}>{formatWeekHeader(w)}</span>
          ))}
        </div>
      </div>
      <div className={styles.legend}>
        <span>
          <span className={`${styles.swatch} ${styles.committed}`} aria-hidden="true" />
          {t.legendCommitted}
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.tentative}`} aria-hidden="true" />
          {t.legendTentative}
        </span>
      </div>
    </Box>
  )
}

export function ProjectLoadSection({ projectId }: { projectId: string }) {
  const q = useProjectLoad(projectId)
  const t = th.workload.projectLoad
  return (
    <Box
      component="section"
      aria-labelledby="project-load-heading"
      data-testid="project-load"
      // minmax(0, 1fr): the track may shrink below the bars' min-content, so their scroll container scrolls
      sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5 }}
    >
      <Typography id="project-load-heading" component="h2" variant="h6" sx={{ fontSize: 'var(--font-lg)' }}>
        {t.heading}
      </Typography>
      {q.isPending ? (
        <CircularProgress size={24} aria-label={th.common.loading} />
      ) : q.isError ? (
        <Alert severity="error">{errorMessage(q.error)}</Alert>
      ) : q.data.archived ? (
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          {t.archived}
        </Typography>
      ) : q.data.sum.total === 0 ? (
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          {t.empty}
        </Typography>
      ) : (
        <>
          <Box sx={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t.member}</th>
                  <th scope="col" className={styles.num}>
                    {t.thisWeek}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t.sum}
                  </th>
                </tr>
              </thead>
              <tbody>
                {q.data.members.map((m) => (
                  <tr key={m.userId} data-user-id={m.userId}>
                    <th scope="row">
                      {m.active ? m.name : `${m.name} ${th.users.deactivatedSuffix}`}
                      {m.role ? <span className={styles.role}>{th.members.roles[m.role]}</span> : null}
                    </th>
                    <td className={styles.num}>{twoDecimals(m.thisWeek.total)}</td>
                    <td className={styles.num} data-testid="member-sum">
                      {twoDecimals(m.sum.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
          <Bars data={q.data} />
        </>
      )}
    </Box>
  )
}
