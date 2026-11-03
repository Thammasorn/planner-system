'use client'
// src/components/workload/WorkloadTooltip.tsx — the hover / focus breakdown of workload cells (FR-1002, §3.3, M9-D8,
// M9-D25). One shared MUI Popper for a whole table, driven by delegated pointerover / focusin on `[data-wl-cell]`
// buttons (no per-cell MUI Tooltip — dense surface, PLAN §3.9). Esc hides it. Never names a leave type or holiday.
import { useCallback, useEffect, useState, type ReactNode, type Ref } from 'react'
import Popper from '@mui/material/Popper'
import type { ISODate } from '@/domain/types'
import type { WorkloadCell, WorkloadResponse } from '@/lib/contracts/workload'
import { tooltipLines } from '@/lib/workload/tooltip'
import styles from './Workload.module.css'

export interface WorkloadTooltipTarget {
  name: string
  week: ISODate
  cell: WorkloadCell
  projects: WorkloadResponse['projects']
  deactivated: boolean
}

export function WorkloadTooltipContent({ target }: { target: WorkloadTooltipTarget }) {
  const lines = tooltipLines(target)
  return (
    <ul>
      {lines.map((l, i) => (
        <li
          key={`${l.kind}-${i}`}
          className={
            l.kind === 'header'
              ? styles.tooltipHeader
              : l.kind === 'status'
                ? styles.tooltipStatus
                : l.kind === 'part'
                  ? styles.tooltipPart
                  : undefined
          }
          data-masked={l.masked ? 'true' : undefined}
        >
          {l.text}
        </li>
      ))}
    </ul>
  )
}

/** Wraps a table / list of WorkloadCells; `resolve` maps a hovered / focused cell button to its data. */
export function WorkloadTooltipHost({
  resolve,
  children,
  className,
  ref,
}: {
  resolve: (cellButton: HTMLElement) => WorkloadTooltipTarget | null
  children: ReactNode
  className?: string
  /** M11.2: the workload table's scroller (the load chart follows its horizontal scroll) */
  ref?: Ref<HTMLDivElement>
}) {
  const [state, setState] = useState<{ anchor: HTMLElement; target: WorkloadTooltipTarget } | null>(null)
  const show = useCallback(
    (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return
      const btn = el.closest<HTMLElement>('[data-wl-cell]')
      if (!btn) return
      const target = resolve(btn)
      setState(target ? { anchor: btn, target } : null)
    },
    [resolve],
  )
  const hide = useCallback((el: EventTarget | null) => {
    if (!(el instanceof HTMLElement) || el.closest('[data-wl-cell]')) setState(null)
  }, [])
  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [state])
  return (
    <div
      ref={ref}
      className={className}
      onPointerOver={(e) => show(e.target)}
      onPointerOut={(e) => hide(e.target)}
      onFocus={(e) => show(e.target)}
      onBlur={(e) => hide(e.target)}
    >
      {children}
      <Popper
        open={state !== null}
        anchorEl={state?.anchor ?? null}
        placement="bottom"
        sx={{ zIndex: 'tooltip' }}
      >
        {state ? (
          <div className={styles.tooltip} data-testid="workload-tooltip">
            <WorkloadTooltipContent target={state.target} />
          </div>
        ) : null}
      </Popper>
    </div>
  )
}
