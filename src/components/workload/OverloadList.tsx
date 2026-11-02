'use client'
// src/components/workload/OverloadList.tsx — tab "รายการที่ล้น (n)" (FR-1006, M9-D10, PRIN-P4/P6): every non-OK cell
// of the selected people in the window, in server order; each row links to the person grid at that week. Overloads
// are shown, never fixed automatically.
import Link from '@/components/Link'
import { EmptyState } from '@/components/common/EmptyState'
import { th } from '@/i18n/th'
import type { OverloadItem } from '@/lib/contracts/workload'
import { formatThaiDate } from '@/lib/format'
import { causeText, twoDecimals } from '@/lib/workload/format'
import { isDeactivatedWeek } from './WorkloadCell'
import styles from './Workload.module.css'

export function OverloadList({ items }: { items: readonly OverloadItem[] }) {
  if (items.length === 0) return <EmptyState title={th.workload.list.empty} />
  const t = th.workload.list
  return (
    <table className={styles.list} aria-label={t.label}>
      <thead>
        <tr>
          <th scope="col">{t.person}</th>
          <th scope="col">{t.week}</th>
          <th scope="col">{t.level}</th>
          <th scope="col">{t.excess}</th>
          <th scope="col">{t.cause}</th>
          <th scope="col">{t.fix}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => {
          const week = formatThaiDate(it.week, 'medium')
          return (
            <tr key={`${it.userId}-${it.week}`} data-user-id={it.userId} data-week={it.week}>
              <th scope="row">{it.name}</th>
              <td>{week}</td>
              <td>
                <span className={styles.levelCell}>
                  <span aria-hidden="true">{th.overload.glyph[it.level]}</span>
                  {th.overload.level[it.level]}
                </span>
              </td>
              <td>{th.overload.excess(twoDecimals(it.excess))}</td>
              <td>{causeText(it.cause, isDeactivatedWeek(it.deactivatedOn, it.week))}</td>
              <td>
                <Link href={it.href} aria-label={t.fixLabel(it.name, week)}>
                  {t.fix}
                </Link>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
