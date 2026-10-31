// CLAUDE.md › ตัวเลขและวันที่ (BR-02, X02): numeric ↔ cd conversion happens only at the repo boundary. Services and
// actions receive integer cd from src/server/repo/** and never touch numeric columns or the conversion helpers.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const serverDir = fileURLToPath(new URL('..', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return e.name.endsWith('.ts') && !e.name.includes('.test.') ? [p] : []
  })
}

describe('numeric ↔ cd conversion stays in the repo (BR-02, X02)', () => {
  it('no service or action imports numericToCd / cdToNumeric or reads workSchedules.fraction', () => {
    const offenders = ['services', 'actions']
      .flatMap((d) => sources(join(serverDir, d)))
      .filter((file) => {
        const text = readFileSync(file, 'utf8')
        return /\b(numericToCd|cdToNumeric)\b/.test(text) || /workSchedules\.fraction/.test(text)
      })
      .map((file) => relative(serverDir, file))
    expect(offenders).toEqual([])
  })
})
