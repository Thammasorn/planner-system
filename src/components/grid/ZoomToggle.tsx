'use client'
// src/components/grid/ZoomToggle.tsx — "[สัปดาห์ | วัน]" (SPEC §8.3, FR-802). A view action: never writes data; the
// caller persists the choice in the `grid.zoom` preference (X53, no localStorage).
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { th } from '@/i18n/th'
import type { GridZoom } from '@/lib/contracts/grid'
import styles from './grid.module.css'

export interface ZoomToggleProps {
  zoom: GridZoom
  onChange: (z: GridZoom) => void
}

export function ZoomToggle({ zoom, onChange }: ZoomToggleProps) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={zoom}
      aria-label={th.grid.toolbar.zoom}
      onChange={(_, v: GridZoom | null) => {
        if (v !== null && v !== zoom) onChange(v)
      }}
      className={styles.zoomGroup}
    >
      <ToggleButton value="WEEK" disableRipple className={styles.toolbarToggle} data-testid="zoom-week">
        {th.grid.toolbar.zoomWeek}
      </ToggleButton>
      <ToggleButton value="DAY" disableRipple className={styles.toolbarToggle} data-testid="zoom-day">
        {th.grid.toolbar.zoomDay}
      </ToggleButton>
    </ToggleButtonGroup>
  )
}
