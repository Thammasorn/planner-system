// M7.1-D30 (supersedes the M7.1-D2 lazy MUI X chunk): the chart is a hand-written SVG layer on the grid's column
// geometry, so no module of the pane imports @mui/x-charts (nothing of it reaches the plan route).
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = fileURLToPath(new URL('.', import.meta.url))

describe('load-chart has no chart library (M7.1-D30)', () => {
  const files = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !f.includes('.test'))
  it.each(files)('%s does not import @mui/x-charts', (f) => {
    expect(readFileSync(path.join(DIR, f), 'utf8')).not.toMatch(/@mui\/x-charts/)
  })
})
