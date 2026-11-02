'use client'
// src/components/workload/WorkloadBadge.tsx — the sidebar ●N of Workload ทีม (FR-1007, X31, M9-D11): OVER cells in the
// next 4 weeks over the people the viewer may see. Server-rendered initial value, then qk.workloadBadge() (refetch on
// mount / focus, invalidated by invalidateLoad). Hidden at 0; never colour alone (the number + a hidden sentence).
import { useWorkloadBadge } from '@/hooks/useWorkload'
import { th } from '@/i18n/th'
import styles from './Workload.module.css'

/** The current OVER count (initial = the server-rendered value). */
export function useWorkloadOverCount(initial: number): number {
  return useWorkloadBadge(initial).data.overCount
}

export function WorkloadBadge({ initial }: { initial: number }) {
  const n = useWorkloadOverCount(initial)
  if (n === 0) return null
  return (
    <span
      role="img"
      className={styles.badge}
      aria-label={th.workload.badge.label(n)}
      data-testid="workload-badge"
    >
      <span aria-hidden="true" className={styles.dot}>
        ●
      </span>
      {n}
    </span>
  )
}
