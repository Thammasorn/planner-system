// src/lib/project-colors.ts — the 12 project / client colour swatches (M2-D15). Default = SPEC §6.2 projects.color.
export const DEFAULT_PROJECT_COLOR = '#2F5597'

export const PROJECT_COLORS = [
  '#2F5597',
  '#1F3864',
  '#0F766E',
  '#15803D',
  '#A16207',
  '#B45309',
  '#B91C1C',
  '#BE185D',
  '#7E22CE',
  '#4338CA',
  '#0369A1',
  '#475569',
] as const

export type ProjectColor = (typeof PROJECT_COLORS)[number]
