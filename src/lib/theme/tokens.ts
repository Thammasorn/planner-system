// src/lib/theme/tokens.ts — TS mirror of the SPEC §8.12 scale in src/app/tokens.css (plan/m06.1 S0.11, M6.1-D21/D22).
// The MUI theme (S4) and components read the scale through these helpers instead of writing px values (FR-1605).
// tokens.test.ts checks every value against tokens.css. Pure and isomorphic.

export const FONT = {
  xs: '12px',
  sm: '13px',
  md: '14px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
} as const
export type FontName = keyof typeof FONT

export const LEADING = { ui: '1.5', doc: '1.7' } as const
export const WEIGHT = { regular: '400', medium: '500', bold: '600' } as const

/** `--space-n` (n = multiples of 4 px). */
export const SPACE = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
  12: '48px',
} as const
export type SpaceStep = keyof typeof SPACE

/** MUI spacing factors (1 = 8 px) allowed by the token scale: each maps to one `--space-n` (0 = none). */
export const SPACING_FACTORS = [0, 0.5, 1, 1.5, 2, 3, 4, 6] as const

export const RADIUS = { sm: '4px', md: '6px', lg: '8px' } as const

export const LAYOUT = {
  'header-height': '48px',
  'doc-column': '760px',
  'panel-width': '440px',
  'sidebar-width': '248px',
} as const

/** The M6.1 surface colours (light + dark), as in tokens.css. M6.1-D21: --text-secondary deviates from SPEC. */
export const SURFACE = {
  light: {
    'border-subtle': '#e5e7eb',
    'hover-bg': '#f3f4f6',
    'text-secondary': '#646a75',
    surface: '#ffffff',
    'surface-muted': '#f9fafb',
  },
  dark: {
    'border-subtle': '#2e3238',
    'hover-bg': '#24272c',
    'text-secondary': '#a3a9b4',
    surface: '#121212',
    'surface-muted': '#1a1c1f',
  },
} as const

const FACTOR_STEP: Readonly<Record<number, SpaceStep>> = { 0.5: 1, 1: 2, 1.5: 3, 2: 4, 3: 6, 4: 8, 6: 12 }

/**
 * MUI spacing factor → CSS value (M6.1-D22): a scale factor → `var(--space-n)`, 0 → '0', anything else →
 * `calc(f * var(--space-2))` (negative factors keep their sign; the token-scale scanner flags off-scale factors).
 */
export function spaceVar(factor: number): string {
  if (factor === 0) return '0'
  const step = FACTOR_STEP[Math.abs(factor)]
  if (step !== undefined) return factor < 0 ? `calc(-1 * var(--space-${step}))` : `var(--space-${step})`
  return `calc(${factor} * var(--space-2))`
}

/** `var(--font-<name>)`. */
export function fontVar(name: FontName): string {
  return `var(--font-${name})`
}

/** M7.1 (X51) non-text colours, as in tokens.css: one categorical colour per chart series (person i →
 *  `--chart-{(i mod 8) + 1}`, M7.1-D4), the three plan-marker colours and the month boundary line. */
export const CHART_SERIES_COUNT = 8
export const CHART = {
  light: ['#2563eb', '#c2410c', '#0f766e', '#9333ea', '#be185d', '#4d7c0f', '#0369a1', '#b45309'],
  dark: ['#60a5fa', '#fb923c', '#2dd4bf', '#c084fc', '#f472b6', '#a3e635', '#38bdf8', '#fbbf24'],
} as const
export const MARKER = {
  light: { 'marker-red': '#dc2626', 'marker-yellow': '#a16207', 'marker-green': '#15803d' },
  dark: { 'marker-red': '#f87171', 'marker-yellow': '#facc15', 'marker-green': '#4ade80' },
} as const
export const BORDER_MONTH = { light: '#7b8597', dark: '#7c8aa0' } as const

/** `var(--chart-n)` of the i-th series (0-based; wraps every 8). */
export function chartVar(index: number): string {
  const n = (((index % CHART_SERIES_COUNT) + CHART_SERIES_COUNT) % CHART_SERIES_COUNT) + 1
  return `var(--chart-${n})`
}

/** `var(--marker-red|yellow|green)` of a plan-marker colour. */
export function markerVar(color: 'RED' | 'YELLOW' | 'GREEN'): string {
  return `var(--marker-${color.toLowerCase()})`
}
