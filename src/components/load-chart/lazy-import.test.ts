// M7.1-D2 / r9 §3b: nothing of @mui/x-charts may reach the plan route's initial JS. The panel modules import x-charts
// types only; the chart module is loaded through next/dynamic(…, { ssr: false }) inside LoadChartPanel.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = fileURLToPath(new URL('.', import.meta.url))
const source = (f: string) => readFileSync(path.join(DIR, f), 'utf8')

describe('load-chart lazy loading (M7.1-D2)', () => {
  it.each(['LoadChartPanel.tsx', 'LoadTable.tsx', 'ShapeGlyph.tsx', 'chart-model.ts', 'types.ts'])(
    '%s has no value import of @mui/x-charts and no static import of LoadLineChart',
    (f) => {
      const src = source(f)
      expect(src).not.toMatch(/^import (?!type )[^\n]*['"]@mui\/x-charts/m)
      expect(src).not.toMatch(/^import [^\n]*from '\.\/LoadLineChart'/m)
    },
  )

  it('LoadChartPanel loads LoadLineChart with next/dynamic and ssr: false', () => {
    const panel = source('LoadChartPanel.tsx')
    expect(panel).toMatch(/dynamic\(\(\) => import\('\.\/LoadLineChart'\)/)
    expect(panel).toMatch(/ssr: false/)
  })
})
