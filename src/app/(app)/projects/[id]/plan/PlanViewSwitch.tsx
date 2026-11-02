'use client'
// "[แผนงาน | ปฏิทิน]" (FR-810, §8.13): a segmented control at the left of the toolbar row. A view action only; the
// caller updates `?view=` and the `plan.view` preference (X53, no localStorage).
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { th } from '@/i18n/th'
import type { PlanView } from '@/lib/schemas/preferences'

export function PlanViewSwitch({ view, onChange }: { view: PlanView; onChange: (v: PlanView) => void }) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={view}
      aria-label={th.planView.label}
      onChange={(_, v: PlanView | null) => {
        if (v !== null && v !== view) onChange(v)
      }}
      sx={{ flex: 'none', '& .MuiToggleButton-root': { px: 1.5, py: 0.5, fontSize: 'var(--font-sm)' } }}
    >
      <ToggleButton value="GRID" disableRipple data-testid="plan-view-grid">
        {th.planView.grid}
      </ToggleButton>
      <ToggleButton value="CALENDAR" disableRipple data-testid="plan-view-calendar">
        {th.planView.calendar}
      </ToggleButton>
    </ToggleButtonGroup>
  )
}
