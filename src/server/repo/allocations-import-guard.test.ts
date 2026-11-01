// M6 S2.1 guard (r5 M6-20, BR-02, SPEC §6.5): only repo/allocations.ts imports the `allocations` table, so every
// query on it carries the week_start range and numeric ↔ cd stays at that edge. Tests, seeds and schema are exempt.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(process.cwd(), 'src/server')
const ALLOWED = new Set([path.join(ROOT, 'repo/allocations.ts'), path.join(ROOT, 'db/schema.ts')])

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return files(full)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : []
  })
}

/** Named imports from a db/schema module (relative or aliased), including `import * as` of it. */
const SCHEMA_IMPORT = /import\s+(?:type\s+)?(\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+['"](?:[./]+|@\/server\/)db\/schema['"]/g

function importsAllocations(src: string): boolean {
  for (const m of src.matchAll(SCHEMA_IMPORT)) {
    const clause = m[1]!
    if (clause.startsWith('*')) return true
    const names = clause
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/)[0]!.replace(/^type\s+/, ''))
    if (names.includes('allocations')) return true
  }
  return false
}

describe('allocations import guard (r5 M6-20)', () => {
  it('the regex sees a named import and a namespace import', () => {
    expect(importsAllocations("import { tasks, allocations } from '../db/schema'")).toBe(true)
    expect(importsAllocations("import * as s from '@/server/db/schema'")).toBe(true)
    expect(importsAllocations("import { tasks } from '../db/schema'")).toBe(false)
  })

  it('no file under src/server except repo/allocations.ts and db/schema.ts imports the allocations table', () => {
    const offenders = files(ROOT)
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => importsAllocations(readFileSync(f, 'utf8')))
      .map((f) => path.relative(process.cwd(), f))
    expect(offenders).toEqual([])
  })
})
