// src/lib/theme/theme.test.ts — the MUI theme reads the SPEC §8.12 scale (FR-1605, AC-1605; plan/m06.1 S4.1, M6.1-D22).
// Palette ↔ tokens parity (light + dark), typography variants → var(--font-*), spacing → var(--space-n), radius.
// The jsdom render spike of MUI components with the spacing function lives in theme.spike.test.tsx (ui project).
import type { Palette } from '@mui/material/styles'
import { describe, expect, it } from 'vitest'
import { SPACING_FACTORS, SURFACE } from './tokens'
import { theme } from './theme'

type Scheme = 'light' | 'dark'

/** `createTheme` with cssVariables keeps both schemes on the theme object (not part of the public `Theme` type). */
const schemes = (theme as unknown as { colorSchemes: Partial<Record<Scheme, { palette: Palette }>> })
  .colorSchemes

function palette(scheme: Scheme): Palette {
  const p = schemes[scheme]?.palette
  if (!p) throw new Error(`no ${scheme} scheme`)
  return p
}

describe('palette ↔ tokens parity (M6.1-D22)', () => {
  it.each<Scheme>(['light', 'dark'])(
    '%s: divider, text.secondary, background, action.hover mirror tokens.css',
    (s) => {
      const p = palette(s)
      const t = SURFACE[s]
      expect(p.divider.toLowerCase()).toBe(t['border-subtle'])
      expect(p.text.secondary.toLowerCase()).toBe(t['text-secondary'])
      expect(p.background.default.toLowerCase()).toBe(t.surface)
      expect(p.background.paper.toLowerCase()).toBe(t.surface)
      expect(p.action.hover.toLowerCase()).toBe(t['hover-bg'])
    },
  )

  it('keeps the brand primary / secondary (PLAN §3.9)', () => {
    expect(palette('light').primary.main.toLowerCase()).toBe('#2f5597')
    expect(palette('light').secondary.main.toLowerCase()).toBe('#1f3864')
  })
})

describe('typography (M6.1-D22)', () => {
  const ty = theme.typography

  it('base size 14 and the font stack', () => {
    expect(ty.fontSize).toBe(14)
    expect(ty.fontFamily).toContain('var(--font-plex-thai)')
  })

  it.each([
    ['h1', 'var(--font-3xl)', 'var(--weight-bold)'],
    ['h2', 'var(--font-2xl)', 'var(--weight-bold)'],
    ['h3', 'var(--font-xl)', 'var(--weight-bold)'],
    ['h4', 'var(--font-lg)', 'var(--weight-bold)'],
    ['h5', 'var(--font-md)', 'var(--weight-bold)'],
    ['h6', 'var(--font-md)', 'var(--weight-bold)'],
    ['subtitle1', 'var(--font-md)', 'var(--weight-medium)'],
    ['subtitle2', 'var(--font-sm)', 'var(--weight-medium)'],
    ['body1', 'var(--font-md)', 'var(--weight-regular)'],
    ['body2', 'var(--font-sm)', 'var(--weight-regular)'],
    ['caption', 'var(--font-xs)', 'var(--weight-regular)'],
    ['button', 'var(--font-md)', 'var(--weight-medium)'],
  ] as const)('%s → %s / %s', (variant, size, weight) => {
    expect(ty[variant].fontSize).toBe(size)
    expect(ty[variant].fontWeight).toBe(weight)
  })

  it('buttons are not uppercase; UI line height comes from --leading-ui', () => {
    expect(ty.button.textTransform).toBe('none')
    expect(ty.body1.lineHeight).toBe('var(--leading-ui)')
  })
})

describe('spacing → --space-n (M6.1-D22)', () => {
  it('maps every scale factor to one token', () => {
    expect(theme.spacing(2)).toBe('var(--space-4)')
    expect(theme.spacing(1)).toBe('var(--space-2)')
    expect(theme.spacing(0.5)).toBe('var(--space-1)')
    expect(theme.spacing(6)).toBe('var(--space-12)')
    expect(theme.spacing(0)).toBe('0')
    for (const f of SPACING_FACTORS) expect(theme.spacing(f)).not.toMatch(/NaN|undefined/)
  })

  it('off-scale factors stay valid CSS; several arguments join with spaces', () => {
    expect(theme.spacing(5)).toBe('calc(5 * var(--space-2))')
    expect(theme.spacing(1, 2)).toBe('var(--space-2) var(--space-4)')
    expect(theme.spacing(-1)).toBe('calc(-1 * var(--space-2))')
  })
})

describe('shape (M6.1-D22)', () => {
  it('borderRadius 6 = --radius-md', () => {
    expect(theme.shape.borderRadius).toBe(6)
  })
})
