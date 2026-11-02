'use client'
// src/components/people/PeopleDirectory.tsx — ทีมงาน `/people` (FR-1008, M9-D14): the people the viewer may see,
// grouped by position, each with this week's workload cell (view ALL, days — M9-D21). The cell's tooltip is the
// shared workload breakdown; clicking it opens the person page. Two columns only: the position is the group header, so
// a position column would only push this week's load off a 390 px screen (review M9, SPEC §9 phone scope).
import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Box from '@mui/material/Box'
import Link from '@/components/Link'
import { EmptyState } from '@/components/common/EmptyState'
import { WorkloadCell } from '@/components/workload/WorkloadCell'
import { WorkloadTooltipHost, type WorkloadTooltipTarget } from '@/components/workload/WorkloadTooltip'
import styles from '@/components/workload/Workload.module.css'
import { usePeopleDirectory } from '@/hooks/useWorkload'
import { th } from '@/i18n/th'
import type { PeopleDirectoryPerson } from '@/lib/contracts/workload'
import { personTabHref } from './people-tabs'
import local from './PeopleDirectory.module.css'

/** GET /api/people sends no project dictionary, so the directory tooltip shows totals only (no per-project lines —
 *  a visible project would otherwise read as งานในโปรเจคอื่น). */
const NO_PROJECTS = {}

export function PeopleDirectory() {
  const q = usePeopleDirectory()
  const router = useRouter()
  const byId = useMemo(
    () =>
      new Map<string, PeopleDirectoryPerson>(
        (q.data?.groups ?? []).flatMap((g) => g.people.map((p) => [p.userId, p])),
      ),
    [q.data],
  )
  const week = q.data?.week
  const resolve = useCallback(
    (btn: HTMLElement): WorkloadTooltipTarget | null => {
      const id = btn.closest<HTMLElement>('[data-user-id]')?.dataset.userId
      const p = id ? byId.get(id) : undefined
      if (!p || !week) return null
      return {
        name: p.name,
        week,
        cell: { ...p.thisWeek, byProject: [] },
        projects: NO_PROJECTS,
        deactivated: !p.active,
      }
    },
    [byId, week],
  )

  if (q.isPending)
    return (
      <Box aria-busy="true" role="status" aria-label={th.common.loading}>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} height={32} />
        ))}
      </Box>
    )
  if (q.isError)
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void q.refetch()}>
            {th.workload.retry}
          </Button>
        }
      >
        {th.people.loadError}
      </Alert>
    )
  if (q.data.groups.length === 0) return <EmptyState title={th.people.empty} />
  const c = th.people.columns
  return (
    <WorkloadTooltipHost resolve={resolve} className={`${styles.scroller} ${local.directory}`}>
      <table className={styles.table} aria-label={th.people.directoryLabel}>
        <thead>
          <tr>
            <th scope="col" className={styles.corner}>
              {c.name}
            </th>
            <th scope="col" className={styles.weekHeader}>
              {c.thisWeek}
            </th>
          </tr>
        </thead>
        {q.data.groups.map((g) => (
          <tbody key={g.positionId ?? 'none'}>
            <tr>
              <th scope="rowgroup" colSpan={2} className={styles.groupHeader}>
                {g.name}
              </th>
            </tr>
            {g.people.map((p) => {
              const href = personTabHref(p.userId, 'plan')
              return (
                <tr key={p.userId} data-user-id={p.userId}>
                  <th scope="row" className={styles.personCell}>
                    <span className={styles.personInner}>
                      <Link className={styles.personLink} href={href}>
                        {p.name}
                      </Link>
                      {p.active ? null : <span className={styles.chip}>{th.workload.deactivated}</span>}
                    </span>
                  </th>
                  <td className={styles.cellTd}>
                    <WorkloadCell
                      name={p.name}
                      week={q.data.week}
                      cell={p.thisWeek}
                      view="ALL"
                      projects={NO_PROJECTS}
                      deactivated={!p.active}
                      onOpen={() => router.push(`${href}?week=${q.data.week}`)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </WorkloadTooltipHost>
  )
}
