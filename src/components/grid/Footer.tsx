'use client'
// src/components/grid/Footer.tsx — ★ the sticky footer (FR-806, FR-809, X29, M6-D8): FOOTER_ROWS = 3 rows
// ภาระรวม (names) · Capacity · % plus the "รวมงานโปรเจคอื่นของคนเหล่านี้" switch. All values in days (any unit).
// Rendered by VirtualGrid as the in-flow sticky sibling after the sized body (r4 §13).
import Switch from '@mui/material/Switch'
import type { VirtualItem } from '@tanstack/react-virtual'
import { formatCd } from '@/domain/units'
import type { LoadView } from '@/domain/types'
import { th } from '@/i18n/th'
import { footerValue, type FooterCell as FooterCellData } from '@/lib/grid/aggregate'
import { FOOTER_ROWS, NAME_COL_W, ROW_H, TOTAL_W, type GridColumn } from '@/lib/grid/columns'
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
}

const days1 = (cd: number) => formatCd(cd, { unit: 'DAYS', decimals: 1 })

export function Footer(p: FooterProps) {
  const rows = [
    {
      kind: 'load' as const,
      label: p.names.length > 0 ? th.grid.footer.load(p.names.join(', ')) : th.grid.footer.loadEmpty,
      text: (c: FooterCellData) => days1(footerValue(c, p.view).loadCd),
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
            className={styles.footerHeader}
            style={{ width: NAME_COL_W, height: ROW_H }}
          >
            <span className={styles.name}>{row.label}</span>
            {row.kind === 'util' ? (
              <label className={styles.actions}>
                <Switch
                  size="small"
                  checked={p.includeOthers}
                  onChange={(e) => p.onIncludeOthers(e.target.checked)}
                  slotProps={{ input: { 'aria-label': th.grid.toolbar.includeOthers } }}
                />
                <span className={styles.muted}>{th.grid.footer.withOthers}</span>
              </label>
            ) : null}
          </div>
          {p.vCols.map((v) => {
            const col = p.cols[v.index]
            if (!col) return null
            const cell = p.cells[col.key]
            return (
              <FooterCell
                key={v.key}
                kind={row.kind}
                periodKey={col.key}
                colIndex={v.index}
                left={v.start}
                width={v.size}
                text={cell ? row.text(cell) : ''}
              />
            )
          })}
          <div
            role="gridcell"
            aria-colindex={p.cols.length + 2}
            className={styles.footerTotal}
            style={{ width: TOTAL_W, height: ROW_H }}
          />
        </div>
      ))}
    </div>
  )
}
