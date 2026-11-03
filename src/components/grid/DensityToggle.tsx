'use client'
// src/components/grid/DensityToggle.tsx — "[ปกติ | แคบ]" week-column density (v3.8, FR-822) of the plan grid and the
// /workload table. A view action: the caller stores it in `grid.density` (user_preferences, never localStorage). Same
// segmented control as ZoomToggle (aria-pressed + the selected fill, never colour alone).
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { th } from '@/i18n/th'
import type { GridDensity } from '@/lib/schemas/preferences'
import styles from './grid.module.css'

export interface DensityToggleProps {
  density: GridDensity
  onChange: (d: GridDensity) => void
}

export function DensityToggle({ density, onChange }: DensityToggleProps) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={density}
      aria-label={th.grid.toolbar.density}
      onChange={(_, v: GridDensity | null) => {
        if (v !== null && v !== density) onChange(v)
      }}
      className={styles.zoomGroup}
      sx={{ flex: 'none', '& .MuiToggleButton-root': { px: 1.5, py: 0.5, fontSize: 'var(--font-sm)' } }}
    >
      <ToggleButton value="NORMAL" disableRipple data-testid="density-normal">
        {th.grid.toolbar.densityNormal}
      </ToggleButton>
      <ToggleButton value="COMPACT" disableRipple data-testid="density-compact">
        {th.grid.toolbar.densityCompact}
      </ToggleButton>
    </ToggleButtonGroup>
  )
}
