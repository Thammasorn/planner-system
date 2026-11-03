// M11.1 (owner 2026-11-02, SPEC v3.4 D24 reversed, M11.1-D2): milestones.color (0015) → plan markers become
// milestones (0016, custom) → plan_markers and its enum dropped (0017). A scratch DB receives the journal up to 0014,
// rows are written with the pre-M11.1 schema, then 0015…0017 run exactly as the migrator would (journal order).
import type postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import {
  applyJournal,
  createScratchDb,
  dropScratchDb,
  entryStatements,
  readJournal,
} from '../../../tests/helpers/migrate-partial'

const SCRATCH = 'm11_1_markers'

interface MilestoneRowDb {
  id: string
  project_id: string
  name: string
  date: string
  description: string | null
  completed_on: string | null
  color: string
  created_by: string
  created_at: Date
  deleted_at: Date | null
  deleted_batch: string | null
}

const BATCH = '0b7a3c1e-11aa-4b1c-9d11-000000000001'

describe('M11.1 migrations: milestones.color (0015) + plan markers → milestones (0016) + drop plan_markers (0017)', () => {
  let sql: postgres.Sql
  const userId = 'u-m11-1'
  const pid: Record<'pos' | 'crm', string> = { pos: '', crm: '' }
  const mk: Record<string, string> = {}
  let existingMilestone = ''
  let rows: Map<string, MilestoneRowDb>

  beforeAll(async () => {
    sql = (await createScratchDb(SCRATCH)).sql
    await applyJournal(sql, { upTo: '0014' })

    await sql`insert into "user" (id, name, email) values (${userId}, 'Cindy', 'cindy@example.test')`
    for (const k of ['pos', 'crm'] as const) {
      const [p] = await sql<{ id: string }[]>`
        insert into projects (name, created_by) values (${k}, ${userId}) returning id`
      pid[k] = p!.id
    }
    const [m] = await sql<{ id: string }[]>`
      insert into milestones (project_id, name, date, created_by)
      values (${pid.pos}, 'Go-live', '2026-11-30', ${userId}) returning id`
    existingMilestone = m!.id
    const vectors: [string, 'pos' | 'crm', string, 'RED' | 'YELLOW' | 'GREEN', string | null, boolean][] = [
      ['label', 'pos', '2026-10-23', 'RED', 'UAT sign-off', false],
      ['padded', 'pos', '2026-10-23', 'YELLOW', '  ส่งมอบ  ', false],
      ['noLabel', 'pos', '2026-11-06', 'GREEN', null, false],
      ['deleted', 'pos', '2026-11-13', 'RED', 'ลบแล้ว', true],
      ['deletedNoLabel', 'crm', '2026-12-04', 'YELLOW', null, true],
      ['crm', 'crm', '2026-10-30', 'GREEN', 'Cutover', false],
    ]
    for (const [key, project, date, color, label, deleted] of vectors) {
      const [r] = await sql<{ id: string }[]>`
        insert into plan_markers (project_id, date, color, label, created_by, created_at, updated_at)
        values (${pid[project]}, ${date}, ${color}, ${label}, ${userId}, '2026-10-01T03:00:00Z', '2026-10-02T03:00:00Z')
        returning id`
      mk[key] = r!.id
      if (deleted)
        await sql`update plan_markers set deleted_at = '2026-10-05T03:00:00Z', deleted_batch = ${BATCH}
                  where id = ${r!.id}`
    }

    const applied = await applyJournal(sql, { from: '0015', upTo: '0016' })
    expect(applied).toEqual(['0015_m11_1_milestone_color', '0016_m11_1_markers_to_milestones'])
    const all = await sql<
      MilestoneRowDb[]
    >`select *, date::text as date, completed_on::text as completed_on from milestones`
    rows = new Map(all.map((r) => [r.id, r]))
  })

  afterAll(async () => {
    await dropScratchDb(SCRATCH, sql)
  })

  it('journal order is 0014 → 0015 milestone_color → 0016 markers_to_milestones → 0017 drop_plan_markers', () => {
    const tags = readJournal().map((e) => e.tag)
    const i = tags.indexOf('0014_m11_databases')
    expect(tags.slice(i, i + 4)).toEqual([
      '0014_m11_databases',
      '0015_m11_1_milestone_color',
      '0016_m11_1_markers_to_milestones',
      '0017_m11_1_drop_plan_markers',
    ])
  })

  it('existing milestones get the default PURPLE colour', () => {
    expect(rows.get(existingMilestone)?.color).toBe('PURPLE')
  })

  it('every marker (live and deleted) becomes a milestone with the same id; multiple per project', () => {
    expect(rows.size).toBe(1 + 6)
    for (const id of Object.values(mk)) expect(rows.has(id)).toBe(true)
    const byProject = [...rows.values()].filter((r) => r.project_id === pid.pos)
    expect(byProject).toHaveLength(5)
  })

  it('label → name (trimmed); no label → th.milestones.fromMarkerName; colour, date, project kept', () => {
    expect(rows.get(mk.label!)).toMatchObject({
      name: 'UAT sign-off',
      color: 'RED',
      date: '2026-10-23',
      project_id: pid.pos,
    })
    expect(rows.get(mk.padded!)).toMatchObject({ name: 'ส่งมอบ', color: 'YELLOW' })
    expect(rows.get(mk.noLabel!)).toMatchObject({
      name: th.milestones.fromMarkerName,
      color: 'GREEN',
      date: '2026-11-06',
    })
    expect(rows.get(mk.crm!)).toMatchObject({ name: 'Cutover', color: 'GREEN', project_id: pid.crm })
  })

  it('the SQL literal is the i18n string', () => {
    expect(th.milestones.fromMarkerName).toBe('เส้นกำกับ')
    expect(entryStatements('0016_m11_1_markers_to_milestones').join('\n')).toContain(
      `'${th.milestones.fromMarkerName}'`,
    )
  })

  it('open, no description; created_by / created_at copied', () => {
    for (const id of Object.values(mk)) {
      const r = rows.get(id)!
      expect(r.completed_on).toBeNull()
      expect(r.description).toBeNull()
      expect(r.created_by).toBe(userId)
      expect(r.created_at.toISOString()).toBe('2026-10-01T03:00:00.000Z')
    }
  })

  it('soft-deleted markers stay soft-deleted with their batch', () => {
    for (const k of ['deleted', 'deletedNoLabel']) {
      const r = rows.get(mk[k]!)!
      expect(r.deleted_batch).toBe(BATCH)
      expect(r.deleted_at?.toISOString()).toBe('2026-10-05T03:00:00.000Z')
    }
    expect(rows.get(mk.deletedNoLabel!)?.name).toBe(th.milestones.fromMarkerName)
    expect(rows.get(mk.label!)?.deleted_at).toBeNull()
  })

  it('no task is bound and no audit row is written', async () => {
    const [t] = await sql<
      { n: number }[]
    >`select count(*)::int as n from tasks where milestone_id is not null`
    expect(t?.n).toBe(0)
    const [a] = await sql<{ n: number }[]>`select count(*)::int as n from audit_log`
    expect(a?.n).toBe(0)
  })

  it('is idempotent: running 0016 again inserts nothing', async () => {
    await applyJournal(sql, { from: '0016', upTo: '0016' })
    const [r] = await sql<{ n: number }[]>`select count(*)::int as n from milestones`
    expect(r?.n).toBe(7)
  })

  it('0017 drops plan_markers and plan_marker_color; the milestones stay', async () => {
    await applyJournal(sql, { from: '0017', upTo: '0017' })
    const [t] = await sql<
      { n: number }[]
    >`select count(*)::int as n from information_schema.tables where table_name = 'plan_markers'`
    expect(t?.n).toBe(0)
    const [e] = await sql<
      { n: number }[]
    >`select count(*)::int as n from pg_type where typname = 'plan_marker_color'`
    expect(e?.n).toBe(0)
    const [r] = await sql<{ n: number }[]>`select count(*)::int as n from milestones`
    expect(r?.n).toBe(7)
  })
})
