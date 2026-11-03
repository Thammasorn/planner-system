'use client'
// src/components/load/LoadDisplayToggle.tsx — "แสดงภาระเป็น [% | วัน/capacity]" (SPEC FR-1010, M11.1-D4): ONE per-user
// preference `load.display` (user_preferences, X05) shared by the load chart, /workload, /people, the person page and
// the projectWorkload block; any of them toggles it and every other screen follows (the provider is app-wide).
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { usePreferences } from '@/hooks/usePreferences'
import { th } from '@/i18n/th'
import { loadDisplay, type LoadDisplay } from '@/lib/load/display'
import { LOAD_DISPLAYS } from '@/lib/schemas/preferences'

/** The viewer's `load.display` (default PERCENT). */
export function useLoadDisplay(): LoadDisplay {
  return loadDisplay(usePreferences().prefs)
}

export function LoadDisplayToggle({ className }: { className?: string }) {
  const { prefs, setPreference } = usePreferences()
  const value = loadDisplay(prefs)
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      aria-label={th.loadDisplay.label}
      className={className}
      data-testid="load-display-toggle"
      onChange={(_e, v: LoadDisplay | null) => {
        if (v !== null && v !== value) setPreference('load.display', v)
      }}
      sx={{ flex: 'none' }}
    >
      {LOAD_DISPLAYS.map((d) => (
        <ToggleButton
          key={d}
          value={d}
          disableRipple
          aria-label={d === 'PERCENT' ? th.loadDisplay.PERCENT_long : th.loadDisplay.DAYS_long}
          title={d === 'PERCENT' ? th.loadDisplay.PERCENT_long : th.loadDisplay.DAYS_long}
          data-load-display={d}
          sx={{ px: 1, py: 0.5, fontSize: 'var(--font-sm)', textTransform: 'none' }}
        >
          {th.loadDisplay[d]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
