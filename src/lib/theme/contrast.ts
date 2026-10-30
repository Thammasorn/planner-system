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
]

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
