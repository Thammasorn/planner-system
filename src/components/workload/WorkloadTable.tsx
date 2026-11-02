'use client'
// src/components/workload/WorkloadTable.tsx — people × weeks, grouped by position (FR-1001/1002, §8.5, M9-D3/D4/D6).
// A plain <table> (dense, PLAN §3.9) scrolling horizontally inside its own container; roving focus: one tab stop,
// arrows move between cells (e.code), Enter / Space open the side panel (native button). The person column sticks.
import { useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import Link from '@/components/Link'
import { VisuallyHidden } from '@/components/common/VisuallyHidden'
import { weekStart } from '@/domain/dates'
import type { ISODate, LoadView } from '@/domain/types'
import { th } from '@/i18n/th'
import type { WorkloadPerson, WorkloadResponse } from '@/lib/contracts/workload'
import { formatWeekHeader } from '@/lib/format'
import { WorkloadCell, isDeactivatedWeek } from './WorkloadCell'
import { WorkloadTooltipHost, type WorkloadTooltipTarget } from './WorkloadTooltip'
import styles from './Workload.module.css'

export interface WorkloadTableProps {
  data: WorkloadResponse
  view: LoadView
  /** The cell whose panel is open. */
  selected: { userId: string; week: ISODate } | null
  onOpen: (person: WorkloadPerson, week: ISODate) => void
}

const MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

export function WorkloadTable({ data, view, selected, onOpen }: WorkloadTableProps) {
  const people = useMemo(() => data.groups.flatMap((g) => g.people), [data.groups])
  const byId = useMemo(() => new Map(people.map((p) => [p.userId, p])), [people])
  const rowOf = useMemo(() => new Map(people.map((p, i) => [p.userId, i])), [people])
  const thisWeek = weekStart(data.today)
  const [active, setActive] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const r0 = Math.min(active.r, Math.max(0, people.length - 1))
  const c0 = Math.min(active.c, Math.max(0, data.weeks.length - 1))

  const resolve = useCallback(
    (btn: HTMLElement): WorkloadTooltipTarget | null => {
      const userId = btn.closest<HTMLElement>('[data-user-id]')?.dataset.userId
      const week = btn.dataset.week
      const p = userId ? byId.get(userId) : undefined
      const cell = p && week ? p.cells[week] : undefined
      if (!p || !week || !cell) return null
      return {
        name: p.name,
        week,
        cell,
        projects: data.projects,
        deactivated: isDeactivatedWeek(p.deactivatedOn, week),
      }
    },
    [byId, data.projects],
  )

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const move = MOVES[e.code]
    if (!move || e.altKey || e.metaKey || e.ctrlKey) return
    e.preventDefault()
    const r = Math.max(0, Math.min(people.length - 1, r0 + move[0]))
    const c = Math.max(0, Math.min(data.weeks.length - 1, c0 + move[1]))
    setActive({ r, c })
    const table = e.currentTarget.closest('table')
    const next = table?.querySelector<HTMLElement>(
      `tr[data-user-id="${people[r]?.userId ?? ''}"] [data-week="${data.weeks[c] ?? ''}"]`,
    )
    next?.focus()
  }

  return (
    <WorkloadTooltipHost resolve={resolve} className={styles.scroller}>
      <table className={styles.table} aria-label={th.workload.tableLabel} data-testid="workload-table">
        <thead>
          <tr>
            <th scope="col" className={styles.corner}>
              {th.workload.personHeader}
            </th>
            {data.weeks.map((w) => (
              <th
                key={w}
                scope="col"
                className={styles.weekHeader}
                data-week={w}
                data-today={w === thisWeek ? 'true' : undefined}
              >
                {formatWeekHeader(w)}
                {w === thisWeek ? <VisuallyHidden>{` ${th.workload.window.thisWeek}`}</VisuallyHidden> : null}
              </th>
            ))}
          </tr>
        </thead>
        {data.groups.map((g) => (
          <tbody key={g.positionId ?? 'none'} data-position-id={g.positionId ?? ''}>
            <tr>
              <th scope="rowgroup" colSpan={data.weeks.length + 1} className={styles.groupHeader}>
                {g.name}
              </th>
            </tr>
            {g.people.map((p) => {
              const r = rowOf.get(p.userId) ?? 0
              return (
                <tr key={p.userId} data-user-id={p.userId}>
                  <th scope="row" className={styles.personCell}>
                    <span className={styles.personInner}>
                      <Link className={styles.personLink} href={`/people/${p.userId}/plan`}>
                        {p.name}
                      </Link>
                      {p.active ? null : <span className={styles.chip}>{th.workload.deactivated}</span>}
                    </span>
                  </th>
                  {data.weeks.map((w, c) => {
                    const cell = p.cells[w]
                    return (
                      <td key={w} className={styles.cellTd}>
                        {cell ? (
                          <WorkloadCell
                            name={p.name}
                            week={w}
                            cell={cell}
                            view={view}
                            projects={data.projects}
                            deactivated={isDeactivatedWeek(p.deactivatedOn, w)}
                            onOpen={() => {
                              setActive({ r, c })
                              onOpen(p, w)
                            }}
                            tabIndex={r === r0 && c === c0 ? 0 : -1}
                            selected={selected?.userId === p.userId && selected.week === w}
                            onKeyDown={onKeyDown}
                          />
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
    </WorkloadTooltipHost>
  )
}
