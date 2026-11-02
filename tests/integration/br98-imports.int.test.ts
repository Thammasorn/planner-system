// tests/integration/br98-imports.int.test.ts — BR-98 enforced in code (SPEC §5.11 BR-98, §1 P7 exception 2; plan/m11
// S6.4, M11-D34 (2)): no planning / workload / capacity / overload / milestone module reads the database tables or imports
// the database modules. A static check over the source text (no DB needed); it lives in the integration project because
// the unit project only collects src/** and scripts/** (named `.int.test.ts` for that reason — see the S6 report).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const PLANNING_SERVICES = [
  'grid',
  'allocations',
  'capacity',
  'workload',
  'home',
  'my-tasks',
  'teamTasks',
  'timeline',
  'milestones',
  'people',
].map((f) => `src/server/services/${f}.ts`)
const PLANNING_DOMAIN = ['capacity', 'allocation', 'overload', 'milestone'].map((f) => `src/domain/${f}.ts`)

/** Import specifiers of a module (static `import … from`, `export … from`, dynamic `import()`). */
function importsOf(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(/\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g)) out.push(m[1]!)
  for (const m of source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]!)
  return out
}

/** Every reference a planning module could use to reach database data. */
function databaseReferences(source: string): string[] {
  const hits: string[] = []
  for (const spec of importsOf(source)) if (/database|row-pages/i.test(spec)) hits.push(`import ${spec}`)
  // schema table objects (databases, databaseRows, databaseColumns, databaseViews) and raw SQL table names
  for (const m of source.matchAll(/\b(databases|databaseRows|databaseColumns|databaseViews|database_rows|database_columns|database_views|databaseRowId|database_row_id)\b/g))
    hits.push(m[1]!)
  for (const m of source.matchAll(/\bfrom\s+databases\b|\bjoin\s+databases\b/gi)) hits.push(m[0])
  return hits
}

describe('BR-98 — planning code never touches databases (M11-D34 (2))', () => {
  it.each([...PLANNING_SERVICES, ...PLANNING_DOMAIN])('%s has no database import or table reference', (file) => {
    const source = readFileSync(path.join(ROOT, file), 'utf8')
    expect(source.length, `${file} exists and is not empty`).toBeGreaterThan(0)
    expect(databaseReferences(source)).toEqual([])
  })

  it('the detector itself finds the references it is meant to find', () => {
    expect(databaseReferences(`import { databaseRows } from '@/server/db/schema'`)).toContain('databaseRows')
    expect(databaseReferences(`import * as d from '../services/databases'`)).toContain('import ../services/databases')
    expect(databaseReferences('const m = await import("@/domain/database")')).toContain('import @/domain/database')
    expect(databaseReferences('sql`select 1 from database_rows r`')).toContain('database_rows')
    expect(databaseReferences(`import { tasks } from '@/server/db/schema'`)).toEqual([])
  })
})
