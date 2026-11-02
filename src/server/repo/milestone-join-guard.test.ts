// M8 S2.1 guard (M8-D5, X87): every read of `tasks.milestone_id` goes through the live join
// (repo.milestones.LIVE_MILESTONE_JOIN / LIVE_MILESTONE_ON), so a soft-deleted milestone always reads as unbound.
// A file under src/server that names the column (`tasks.milestoneId` in Drizzle or `milestone_id` in SQL) must also
// contain one of the two fragments. Exempt: the schema, repo/milestones.ts (owns the fragments and the write-only
// link/revert statements) and tests. Heuristic by design: it cannot see a raw TaskRow's `.milestoneId` — the
// pParent read-path tests (raw id = a deleted milestone) cover that.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(process.cwd(), 'src/server')
const EXEMPT = new Set([path.join(ROOT, 'db/schema.ts'), path.join(ROOT, 'repo/milestones.ts')])

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return files(full)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : []
  })
}

const READS_COLUMN = /\btasks\.milestoneId\b|\bmilestone_id\b/
const USES_LIVE_JOIN = /\bLIVE_MILESTONE_(JOIN|ON)\b/

function violates(src: string): boolean {
  return READS_COLUMN.test(src) && !USES_LIVE_JOIN.test(src)
}

describe('milestone live-join guard (M8-D5, X87)', () => {
  it('the patterns see Drizzle and SQL reads, and accept files using a live fragment', () => {
    expect(violates('db.select({ m: tasks.milestoneId }).from(tasks)')).toBe(true)
    expect(violates('sql`select t.milestone_id from tasks t`')).toBe(true)
    expect(violates('.leftJoin(milestones, LIVE_MILESTONE_ON) // tasks.milestoneId')).toBe(false)
    expect(violates("const fk = 'tasks_milestone_id_milestones_id_fk'")).toBe(false)
    expect(violates('dto.milestoneId')).toBe(false)
  })

  it('no file under src/server reads tasks.milestone_id without LIVE_MILESTONE_JOIN / LIVE_MILESTONE_ON', () => {
    const offenders = files(ROOT)
      .filter((f) => !EXEMPT.has(f))
      .filter((f) => violates(readFileSync(f, 'utf8')))
      .map((f) => path.relative(process.cwd(), f))
    expect(offenders).toEqual([])
  })
})
