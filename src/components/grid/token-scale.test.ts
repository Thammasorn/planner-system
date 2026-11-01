// Co-located token-scale check of the grid (FR-1605, AC-1605, M6.1-D24, plan/m06.1 S5.2): every TS/TSX/CSS file under
// src/components/grid uses the §8.12 scale — font sizes, spacing and radii from --font-*/--space-*/--radius-* (or MUI
// scale factors), colours only through var(--…). Cell widths and heights are layout constants and are not scanned.
// The repo test (src/lib/theme/token-scale.repo.test.ts) delegates this directory here and asserts this file exists.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectTokenScale, expectTokenScale } from '@/lib/theme/token-scale'

const dir = fileURLToPath(new URL('.', import.meta.url))

describe('src/components/grid — token scale (§8.12)', () => {
  it('has no off-scale font size, spacing, radius or literal colour', () => {
    expect(() => expectTokenScale(dir)).not.toThrow()
  })

  it('scans the grid sources (grid.module.css and the components), not only tests', () => {
    const r = collectTokenScale(dir)
    expect(r.files).toBeGreaterThanOrEqual(15)
    expect(r.escapes).toEqual([])
  })
})
