// src/lib/files/format-bytes.ts — attachment card sizes (FR-527): binary units, one decimal above bytes, ASCII units.

const UNITS = ['KB', 'MB', 'GB'] as const

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 1024) return `${Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0} B`
  let value = n / 1024
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`
}
