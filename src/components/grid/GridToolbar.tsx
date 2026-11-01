'use client'
// src/components/grid/GridToolbar.tsx — `[สัปดาห์] ◀ [วันนี้] ▶ ภาระ: [ทั้งหมด▾] หน่วย: [วัน▾]` (SPEC §8.3, FR-801/802/804/809,
// M6-D12/D21). The toolbar is one set of MUI controls (not per cell). M7: `[สัปดาห์ | วัน]` is ZoomToggle (FR-802).
// M6.1 (S5.2, §8.12): light toggles from grid.module.css (token scale, --radius-md); it sits right under the header bar.
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import type { CellUnit, LoadView } from '@/domain/types'
import { th } from '@/i18n/th'
import type { GridZoom } from '@/lib/contracts/grid'
import { GRID_UNITS, LOAD_VIEWS } from '@/lib/schemas/preferences'
import type { SaveState } from './useSaveAllocations'
import { ZoomToggle } from './ZoomToggle'
import styles from './grid.module.css'

export interface GridToolbarProps {
  view: LoadView
  unit: CellUnit
  showCompleted: boolean
  saveState: SaveState
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onView: (v: LoadView) => void
  onUnit: (u: CellUnit) => void
  onShowCompleted: (on: boolean) => void
  /** M7 (FR-802) */
  zoom?: GridZoom
  onZoom?: (z: GridZoom) => void
}

export function GridToolbar(p: GridToolbarProps) {
  return (
    <div role="toolbar" aria-label={th.grid.toolbar.label} className={styles.toolbar}>
      <ZoomToggle zoom={p.zoom ?? 'WEEK'} onChange={p.onZoom ?? (() => {})} />
      <IconButton size="small" aria-label={th.grid.toolbar.prev} onClick={p.onPrev} className={styles.toolbarIcon}>
        <ChevronLeft fontSize="small" />
      </IconButton>
      <Button size="small" variant="outlined" onClick={p.onToday} className={styles.toolbarToggle}>
        {th.grid.toolbar.today}
      </Button>
      <IconButton size="small" aria-label={th.grid.toolbar.next} onClick={p.onNext} className={styles.toolbarIcon}>
        <ChevronRight fontSize="small" />
      </IconButton>
      <TextField
        select
        size="small"
        label={th.grid.toolbar.view}
        value={p.view}
        onChange={(e) => p.onView(e.target.value as LoadView)}
        sx={{ minWidth: { xs: 140, sm: 170 } }}
      >
        {LOAD_VIEWS.map((v) => (
          <MenuItem key={v} value={v}>
            {th.grid.view[v]}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label={th.units.label}
        value={p.unit}
        onChange={(e) => p.onUnit(e.target.value as CellUnit)}
        sx={{ minWidth: { xs: 96, sm: 110 } }}
      >
        {GRID_UNITS.map((u) => (
          <MenuItem key={u} value={u}>
            {th.units[u]}
          </MenuItem>
        ))}
      </TextField>
      <FormControlLabel
        className={styles.toolbarSwitch}
        control={
          <Switch
            size="small"
            checked={p.showCompleted}
            onChange={(e) => p.onShowCompleted(e.target.checked)}
          />
        }
        label={th.grid.toolbar.showCompleted}
      />
      <span className={styles.saveState} role="status" aria-live="polite" data-save-status={p.saveState}>
        {th.grid.save[p.saveState]}
      </span>
    </div>
  )
}

/** What M6 draws (§8.3, FR-807, M6-D20): ⋯ day detail, ◐ / * / ▌ tentative, leave stripes + icon, 🎌 holiday week
 *  in the header, ▨ grey stripes for a week without capacity. */
export function GridLegend() {
  return (
    <div className={styles.legend} data-testid="grid-legend">
      <span>{th.grid.legend.dayDetail}</span>
      <span>{th.grid.legend.tentative}</span>
      <span>{th.grid.legend.source}</span>
      <span>{th.grid.legend.bar}</span>
      <span className={styles.legendItem}>
        <EventBusyOutlined fontSize="inherit" aria-hidden="true" />
        {th.grid.legend.leave}
      </span>
      <span>{th.grid.legend.holiday}</span>
      <span>{th.grid.legend.noCapacity}</span>
    </div>
  )
}
