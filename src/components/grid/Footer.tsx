'use client'
// src/components/grid/Footer.tsx — ★ the sticky footer (FR-806, FR-809, X29, M6-D8): FOOTER_ROWS = 3 rows
// ภาระรวม (names) · Capacity · % plus the "รวมงานโปรเจคอื่นของคนเหล่านี้" switch. All values in days (any unit).
// Rendered by VirtualGrid as the in-flow sticky sibling after the sized body (r4 §13).
// M7.1: the label cells span both frozen columns (aria-colspan 2, FR-816); month boundaries (FR-818) and the marker
// lines' footer piece (`overlay`, FR-820) are drawn here too.
// M9 (S3.5, M9-D13, X06): week cells of the ภาระรวม row carry the BR-45 tone of the selected view AND the number AND the
// BR-40 glyph + hidden status text (never colour alone); the person grid relabels the row "ภาระรวม (ทุกโปรเจค)" and has
// no includeOthers switch (its masked row already carries every other project).
// M11.1 (FR-1008/FR-1010): in the person grid that row follows `load.display` ("90%" or "4.5/5").
import Switch from '@mui/material/Switch'
import type { VirtualItem } from '@tanstack/react-virtual'
import type { ReactNode } from 'react'
import { formatCd } from '@/domain/units'
import type { LoadView } from '@/domain/types'
import { th } from '@/i18n/th'
import { workloadDisplayText, type LoadDisplay } from '@/lib/load/display'
import { footerValue, type FooterCell as FooterCellData } from '@/lib/grid/aggregate'
import type { FooterDayCell } from '@/lib/grid/day-footer'
import type { FooterPeriodCell } from '@/lib/grid/load-footer'
import {
  FOOTER_ROWS,
  FROZEN_COL_W,
  FROZEN_COLS,
  ROW_H,
  totalColIndex,
  TOTAL_COL_W,
  type GridColumn,
} from '@/lib/grid/columns'
import { FooterCell } from './FooterCell'
import styles from './grid.module.css'

export interface FooterProps {
  cols: readonly GridColumn[]
  vCols: readonly VirtualItem[]
  totalWidth: number
  /** aria-rowindex of the first footer row */
  firstRowIndex: number
  names: readonly string[]
  cells: Partial<Record<string, FooterCellData>>
  view: LoadView
  includeOthers: boolean
  onIncludeOthers: (on: boolean) => void
  /** M7 (S3.10): day-level tone / glyph of the ภาระรวม row per D: key */
  dayCells?: ReadonlyMap<string, FooterDayCell>
  /** M7.1 (FR-818): keys of the first column of each month */
  monthStarts?: ReadonlySet<string>
  /** M7.1 (FR-820): the footer piece of the marker lines */
  overlay?: ReactNode
  /** M9 (S3.5): week-level tone / glyph of the ภาระรวม row per W: key */
  weekCells?: ReadonlyMap<string, FooterPeriodCell>
  /** M9 person grid: the ภาระรวม row label (th.people.grid.footerLoad) instead of the names */
  loadLabel?: string
  /** M9: false hides the "รวมงานโปรเจคอื่น" switch (person grid); default true */
  showOthersSwitch?: boolean
  /** M11.1 (FR-1008/FR-1010): person grid — the ภาระรวม row shows "90%" (PERCENT) or "4.5/5" (DAYS); absent = days */
  loadDisplay?: LoadDisplay
}

const days1 = (cd: number) => formatCd(cd, { unit: 'DAYS', decimals: 1 })

export function Footer(p: FooterProps) {
  const rows = [
    {
      kind: 'load' as const,
      label:
        p.loadLabel ?? (p.names.length > 0 ? th.grid.footer.load(p.names.join(', ')) : th.grid.footer.loadEmpty),
      text: (c: FooterCellData) => {
        const loadCd = footerValue(c, p.view).loadCd
        if (!p.loadDisplay) return days1(loadCd)
        return loadCd === 0 ? '' : workloadDisplayText(loadCd, c.capacityCd, p.loadDisplay)
      },
    },
    {
      kind: 'capacity' as const,
      label: th.grid.footer.capacity,
      text: (c: FooterCellData) => days1(c.capacityCd),
    },
    {
      kind: 'util' as const,
      label: th.grid.footer.utilization,
      text: (c: FooterCellData) => {
        const v = footerValue(c, p.view)
        if (v.loadCd === 0) return ''
        return v.pct === null ? th.grid.footer.noCapacity : th.grid.footer.percent(v.pct)
      },
    },
  ]
  return (
    <div className={styles.footer} style={{ width: p.totalWidth }} role="rowgroup">
      {rows.slice(0, FOOTER_ROWS).map((row, i) => (
        <div
          key={row.kind}
          role="row"
          aria-rowindex={p.firstRowIndex + i}
          className={styles.footerRow}
          style={{ height: ROW_H, width: p.totalWidth }}
        >
          <div
            role="rowheader"
            aria-colindex={1}
            aria-colspan={FROZEN_COLS}
            className={styles.footerHeader}
            style={{ width: FROZEN_COL_W, height: ROW_H }}
          >
            <span className={styles.name}>{row.label}</span>
            {row.kind === 'util' && (p.showOthersSwitch ?? true) ? (
              // its own slot at the right of the frozen label cell (M7.1 review §8.12): regular weight, a 32 px hit
              // row, the text after the switch; the compact grid keeps only the switch (its aria-label names it)
              <label className={styles.footerSwitch} data-footer-switch="">
                <Switch
                  size="small"
                  checked={p.includeOthers}
                  onChange={(e) => p.onIncludeOthers(e.target.checked)}
                  slotProps={{ input: { 'aria-label': th.grid.toolbar.includeOthers } }}
                />
                <span className={styles.footerSwitchText}>{th.grid.footer.withOthers}</span>
              </label>
            ) : null}
          </div>
          {p.vCols.map((v) => {
            const col = p.cols[v.index]
            if (!col) return null
            const cell = p.cells[col.key]
            const day = row.kind === 'load' && col.kind === 'D' ? p.dayCells?.get(col.key) : undefined
            const week = row.kind === 'load' && col.kind === 'W' ? p.weekCells?.get(col.key) : undefined
            const text = cell ? row.text(cell) : ''
            return (
              <FooterCell
                key={v.key}
                kind={row.kind}
                periodKey={col.key}
                colIndex={v.index}
                left={v.start}
                width={v.size}
                text={text}
                monthStart={p.monthStarts?.has(col.key) ?? false}
                {...(day
                  ? {
                      tone: day.tone,
                      palette: day.palette,
                      glyph: day.glyph,
                      glyphLabel: th.overload.dayStatus(
                        th.overload.level[day.glyph],
                        days1(day.load) || '0',
                        days1(day.capCd) || '0',
                      ),
                      tip: day.overPeople.length > 0,
                    }
                  : {})}
                {...(week
                  ? {
                      tone: week.tone,
                      palette: week.palette,
                      glyph: week.glyph,
                      glyphLabel: th.overload.footerStatus(
                        th.overload.level[week.glyph],
                        days1(week.loadCd) || '0',
                        days1(week.capCd) || '0',
                      ),
                      tip: week.overPeople.length > 0,
                    }
                  : {})}
              />
            )
          })}
          <div
            role="gridcell"
            aria-colindex={totalColIndex(p.cols.length)}
            className={styles.footerTotal}
            style={{ width: TOTAL_COL_W, height: ROW_H }}
          />
        </div>
      ))}
      {p.overlay}
    </div>
  )
}
