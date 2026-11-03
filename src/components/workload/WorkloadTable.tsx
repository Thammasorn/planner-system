'use client'
// src/components/workload/WorkloadTable.tsx — people × weeks, grouped by position (FR-1001/1002, §8.5, M9-D3/D4/D6).
// A plain <table> (dense, PLAN §3.9) scrolling horizontally inside its own container; roving focus: one tab stop,
// arrows move between cells (e.code), Enter / Space open the side panel (native button). The person column sticks.
// M11.2 (FR-1001 v3.5, M11.2-D1/D2): a month-year row above the week row (FR-818's grouping: a week belongs to the
// month of its Monday — src/lib/grid/months.ts) with month boundary lines through the header and body; the table
// reports its measured header geometry (`onGeometry`) so the load chart under it sits on the same columns.
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from 'react'
import Link from '@/components/Link'
import { VisuallyHidden } from '@/components/common/VisuallyHidden'
import { weekStart } from '@/domain/dates'
import type { ISODate, LoadView } from '@/domain/types'
import { th } from '@/i18n/th'
import type { WorkloadPerson, WorkloadResponse } from '@/lib/contracts/workload'
import { formatWeekHeader } from '@/lib/format'
import { monthHeaderCells, sameGeometry, workloadMonthStarts, type TableGeometry } from '@/lib/workload/chart'
import { WorkloadCell, isDeactivatedWeek } from './WorkloadCell'
import { WorkloadTooltipHost, type WorkloadTooltipTarget } from './WorkloadTooltip'
import styles from './Workload.module.css'

export interface WorkloadTableProps {
  data: WorkloadResponse
  view: LoadView
  /** The cell whose panel is open. */
  selected: { userId: string; week: ISODate } | null
  onOpen: (person: WorkloadPerson, week: ISODate) => void
  /** M11.2: the horizontal scroller (the load chart follows it) */
  scrollerRef?: Ref<HTMLDivElement>
  /** M11.2: the measured header geometry, on every change (resize, data, fonts) */
  onGeometry?: (g: TableGeometry) => void
}

/** .monthHeader's horizontal padding (2 × --space-2): the label never outgrows its span. */
const MONTH_PAD_X = 16

/** The table's header geometry in its own content coordinates (px from the table's left edge). */
function measure(table: HTMLTableElement, scroller: HTMLElement | null): TableGeometry {
  const t = table.getBoundingClientRect()
  const corner = table.querySelector<HTMLElement>('thead th[data-corner]')
  const cols = [...table.querySelectorAll<HTMLElement>('thead th[data-week]')].map((h) => {
    const r = h.getBoundingClientRect()
    return { left: r.left - t.left, width: r.width }
  })
  return {
    personW: corner?.getBoundingClientRect().width ?? 0,
    contentW: t.width,
    viewW: scroller?.clientWidth ?? 0,
    cols,
  }
}

const MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

export function WorkloadTable({ data, view, selected, onOpen, scrollerRef, onGeometry }: WorkloadTableProps) {
  const people = useMemo(() => data.groups.flatMap((g) => g.people), [data.groups])
  const byId = useMemo(() => new Map(people.map((p) => [p.userId, p])), [people])
  const rowOf = useMemo(() => new Map(people.map((p, i) => [p.userId, i])), [people])
  const thisWeek = weekStart(data.today)
  const [active, setActive] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const monthStarts = useMemo(() => workloadMonthStarts(data.weeks), [data.weeks])
  const tableRef = useRef<HTMLTableElement>(null)
  const [geometry, setGeometry] = useState<TableGeometry | null>(null)
  const months = useMemo(() => monthHeaderCells(data.weeks, geometry), [data.weeks, geometry])
  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table) return
    const scroller = table.parentElement
    let last: TableGeometry | null = null
    const update = () => {
      const g = measure(table, scroller)
      // jsdom / hidden: nothing laid out → keep the nominal geometry
      if (g.contentW <= 0) return
      if (sameGeometry(last, g)) return
      last = g
      setGeometry(g)
      onGeometry?.(g)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(table)
    if (scroller) ro.observe(scroller)
    for (const h of table.querySelectorAll('thead th')) ro.observe(h)
    return () => ro.disconnect()
  }, [data, onGeometry])
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
    <WorkloadTooltipHost resolve={resolve} className={styles.scroller} ref={scrollerRef}>
      <table
        ref={tableRef}
        className={styles.table}
        aria-label={th.workload.tableLabel}
        data-testid="workload-table"
        style={geometry ? ({ '--wl-person-w': `${geometry.personW}px` } as CSSProperties) : undefined}
      >
        <thead>
          <tr data-month-row="">
            <th scope="col" rowSpan={2} className={styles.corner} data-corner="">
              {th.workload.personHeader}
            </th>
            {months.map((m) => (
              <th
                key={m.key}
                scope="colgroup"
                colSpan={m.span}
                className={styles.monthHeader}
                data-month={m.key}
                data-month-start={m.monthStart ? '' : undefined}
                aria-label={m.label.full}
                title={m.label.text === m.label.full ? undefined : m.label.full}
              >
                <span
                  className={styles.monthLabel}
                  aria-hidden="true"
                  style={{ maxWidth: Math.max(0, m.width - MONTH_PAD_X) }}
                  data-testid={`month-label-${m.key}`}
                >
                  {m.label.text}
                </span>
              </th>
            ))}
          </tr>
          <tr>
            {data.weeks.map((w) => (
              <th
                key={w}
                scope="col"
                className={styles.weekHeader}
                data-week={w}
                data-today={w === thisWeek ? 'true' : undefined}
                data-month-start={monthStarts.has(`W:${w}`) ? '' : undefined}
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
                      <td
                        key={w}
                        className={styles.cellTd}
                        data-month-start={monthStarts.has(`W:${w}`) ? '' : undefined}
                      >
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
