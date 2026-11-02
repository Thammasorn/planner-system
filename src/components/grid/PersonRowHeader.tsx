'use client'
// src/components/grid/PersonRowHeader.tsx — the frozen part of a person-grid header row (plan/m09 S3.4, M9-D12/D28,
// SPEC §7.4, §3.3, §8.9). Same one-rowheader shape as RowHeader (aria-colspan over the frozen columns, roving tab
// stop, row selection), for the two task-less kinds:
// - project: ▸/▾ collapse (in memory, keyed p:), colour square (aria-hidden), the project name as a link to
//   /projects/<id>/plan, ◐ when the project is TENTATIVE.
// - masked: th.masking.otherProjects with the hint th.people.grid.maskedHint — no link, no ↗, no names (§3.3).
import Tooltip from '@mui/material/Tooltip'
import { memo, useCallback, useId, type MouseEvent } from 'react'
import Link from '@/components/Link'
import { StatusGlyph } from '@/components/common/StatusGlyph'
import { th } from '@/i18n/th'
import { FROZEN_COL_W, FROZEN_COLS, TASK_COL_W } from '@/lib/grid/columns'
import type { PersonHeaderRow } from '@/lib/grid/rows'
import { useGridSel, type GridStore } from './gridStore'
import styles from './grid.module.css'

export interface PersonRowHeaderProps {
  store: GridStore
  r: number
  row: PersonHeaderRow
  height: number
  onSelectRow: (r: number) => void
  /** ▸/▾ on a project row (key p:<id>) */
  onToggle: (key: string) => void
}

export const PersonRowHeader = memo(function PersonRowHeader(p: PersonRowHeaderProps) {
  const { row } = p
  const active = useGridSel(
    p.store,
    (s) => s.rowSelection === row.key || (s.hasSelection && s.focus?.r === p.r),
  )
  const selected = useGridSel(p.store, (s) => s.rowSelection === row.key)
  const tab = active ? 0 : -1
  const descId = useId()
  const stop = (e: MouseEvent) => e.stopPropagation()
  const setRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const grid = el.closest<HTMLElement>('[role="grid"]')
    return () => {
      if (el.contains(document.activeElement)) grid?.focus({ preventScroll: true })
    }
  }, [])
  const label = row.kind === 'project' ? row.project.name : row.masked.label
  const tentative = row.kind === 'project' && row.project.certainty === 'TENTATIVE'
  const desc = row.kind === 'masked' ? th.people.grid.maskedHint : tentative ? th.grid.row.tentative : null

  return (
    <div
      ref={setRef}
      role="rowheader"
      aria-colindex={1}
      aria-colspan={FROZEN_COLS}
      aria-label={label}
      aria-describedby={desc ? descId : undefined}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={styles.rowHeader}
      style={{ width: FROZEN_COL_W, height: p.height }}
      data-row-header=""
      data-row-key={row.key}
      data-row-kind={row.kind}
      data-r={p.r}
      onClick={() => p.onSelectRow(p.r)}
    >
      {desc ? (
        <span id={descId} className={styles.srOnly}>
          {desc}
        </span>
      ) : null}
      <div className={styles.taskCell} style={{ width: TASK_COL_W, paddingLeft: 'var(--space-2)' }} data-task-cell="">
        {row.kind === 'project' ? (
          <>
            <button
              type="button"
              className={styles.toggle}
              tabIndex={tab}
              aria-expanded={!row.collapsed}
              aria-label={row.collapsed ? th.grid.row.expand : th.grid.row.collapse}
              onClick={(e) => {
                stop(e)
                p.onToggle(row.key)
              }}
            >
              {row.collapsed ? '▸' : '▾'}
            </button>
            <span
              aria-hidden="true"
              className={styles.projectSwatch}
              style={{ backgroundColor: row.project.color }}
            />
            <Link
              href={`/projects/${row.project.id}/plan`}
              prefetch={false}
              className={styles.projectLink}
              tabIndex={tab}
              title={row.project.name}
              onClick={stop}
              data-project-link=""
            >
              {row.project.name}
            </Link>
            {tentative ? (
              <Tooltip title={th.grid.row.tentative} describeChild>
                <span className={styles.muted}>
                  <StatusGlyph kind="tentative" />
                </span>
              </Tooltip>
            ) : null}
          </>
        ) : (
          <Tooltip title={th.people.grid.maskedHint} describeChild>
            <span className={styles.maskedName} title={row.masked.label}>
              {row.masked.label}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  )
})
