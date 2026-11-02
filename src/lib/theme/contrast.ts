/** WCAG contrast helpers and the token-pair registry (SPEC §8.7, §8.9; X51). Pure and isomorphic. */

export type TokenSet = Readonly<Record<string, string>>

/** fg/bg token pairs that carry text; later milestones append pairs (e.g. heat text in M9). Non-text tokens
 *  (--today 3.76:1, --milestone, --heat-*) are excluded on purpose (SPEC §8.9 applies to text). */
export const TEXT_PAIRS: ReadonlyArray<readonly [fg: string, bg: string]> = [
  ['load-over-fg', 'load-over-bg'],
  ['load-full-fg', 'load-full-bg'],
  ['load-light-fg', 'load-light-bg'],
  ['certain-fg', 'certain-bg'],
  ['tentative-fg', 'tentative-bg'],
  ['faded-fg', 'surface'],
  ['faded-fg', 'nonworking'],
  ['faded-fg', 'holiday'],
  // sidebar (M0): active row text and the app name
  ['brand-navy', 'brand-light'],
  ['brand-navy', 'surface'],
  // M6.1 (SPEC §8.12, M6.1-D21): property labels, secondary text, sidebar sections, hovered rows
  ['text-secondary', 'surface'],
  ['text-secondary', 'hover-bg'],
  ['text-secondary', 'surface-muted'],
  ['faded-fg', 'hover-bg'],
]

/** M7.1 (X51): non-text tokens (lines, marks, flags) that must reach 3:1 (WCAG 1.4.11) against every background they are
 *  drawn on — grid cells (--surface), header rows (--surface-muted), weekend / holiday columns and hovered rows. */
export const NON_TEXT_TOKENS: readonly string[] = [
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-6',
  'chart-7',
  'chart-8',
  'marker-red',
  'marker-yellow',
  'marker-green',
  'border-month',
]
export const NON_TEXT_BACKGROUNDS: readonly string[] = [
  'surface',
  'surface-muted',
  'nonworking',
  'holiday',
  'hover-bg',
]
export const NON_TEXT_MIN_RATIO = 3

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

function channel(hex2: string): number {
  const c = Number.parseInt(hex2, 16) / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** sRGB `#RRGGBB` → relative luminance (WCAG 2.x). Throws RangeError for any other format. */
export function relativeLuminance(hex: string): number {
  const m = HEX.exec(hex.trim())
  if (!m) throw new RangeError(`Expected #RRGGBB, got ${JSON.stringify(hex)}`)
  const [, r = '', g = '', b = ''] = m
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** (Lmax + 0.05) / (Lmin + 0.05) */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function parseBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return {}
  const end = css.indexOf('}', start)
  const body = css.slice(start, end < 0 ? undefined : end)
  const out: Record<string, string> = {}
  for (const line of body.split('\n')) {
    const m = /^\s*--([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/i.exec(line)
    if (m?.[1] && m[2]) out[m[1]] = m[2]
  }
  return out
}

/** Parses `:root { --x: #RRGGBB; }` and `.dark { … }` blocks (one declaration per line). */
export function parseTokenBlocks(css: string): { light: TokenSet; dark: TokenSet } {
  return { light: parseBlock(css, ':root'), dark: parseBlock(css, '.dark') }
}
