// tests/golden/database-isolation.int.test.ts — BR-98 / AC-1413 on the golden seed (SPEC §5.11 BR-98, §1 P7 exception 2,
// §11.3; plan/m11 S6.4, M11-D34 (3)). A database on the POS charter gets PERSON / NUMBER / DATE cells (Mint, a POS member,
// plus Peter, who is not; "5"; a date in this week) through the real actions, as the manager; afterwards the POS grid
// chunk, the team workload table (M9), the POS members and every non-database table are byte-identical, and the only new audit rows are
// `database` rows of POS. Golden numbers are never re-typed here: "unchanged" is compared against the state before the
// writes, and F1 itself stays covered by golden.int.test.ts. "today" = 2026-09-30 (X45/X90).
import { asc, eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ISODate } from '@/domain/types'
import type { ActionResult } from '@/lib/action-result'
import {
  createDatabase,
  createDatabaseColumn,
  createDatabaseRows,
  updateDatabaseRow,
} from '@/server/actions/databases'
import { db } from '@/server/db/client'
import { pages, projectMembers } from '@/server/db/schema'
import * as services from '@/server/services'
import { GOLDEN_PATH, seedGolden } from '../../scripts/lib/fixtures'
import { asUser } from '../helpers/as-user'
import { auditCount, auditRowsAfter } from '../helpers/audit'
import { goldenProjectId, goldenUser } from '../authz/_support/golden'

const TODAY: ISODate = '2026-09-30'
const THIS_WEEK: ISODate = '2026-09-28'
const FROM: ISODate = '2026-08-31'
const TO: ISODate = '2027-01-04'
/** The database tables and the audit log may change; nothing else may (BR-98). `pages` is compared on its content
 *  columns only (the owner row may be locked / touched by createDatabase; its content never changes, FR-1474). */
const DATABASE_TABLES = new Set(['databases', 'database_columns', 'database_rows', 'database_views', 'audit_log', 'pages'])

beforeEach(() => {
  vi.stubEnv('ALLOW_TEST_HOOKS', '1')
  vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
})

function ok<T extends object>(r: ActionResult<T>, what: string): T {
  if (!r.ok) throw new Error(`${what}: ${r.code} ${r.message}`)
  return r
}

/** Every base table of the public schema except the database tables, as `table → JSON of all rows (stable order)`. */
async function otherTables(): Promise<Map<string, string>> {
  const names = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  )
  const out = new Map<string, string>()
  for (const { table_name: t } of names) {
    if (DATABASE_TABLES.has(t)) continue
    const rows = await db.execute<{ j: unknown }>(
      sql`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb) as j from ${sql.identifier(t)} x`,
    )
    out.set(t, JSON.stringify(rows[0]?.j))
  }
  const content = await db
    .select({ id: pages.id, kind: pages.kind, content: pages.content, contentText: pages.contentText })
    .from(pages)
    .orderBy(asc(pages.id))
  out.set('pages (content)', JSON.stringify(content))
  return out
}

async function planningState(posId: string): Promise<{ grid: string; workload: string; members: string }> {
  const manager = asUser(await goldenUser('Manager'))
  const grid = await services.grid.buildChunk(
    db,
    manager,
    { kind: 'project', id: posId },
    { from: FROM, to: TO, expand: [], zoom: 'week', includeOthers: false },
    TODAY,
  )
  const workload = await services.workload.buildTable(db, manager, { window: { from: FROM, to: TO } }, TODAY)
  const members = await db
    .select({ userId: projectMembers.userId, role: projectMembers.role })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, posId))
    .orderBy(asc(projectMembers.userId))
  return { grid: JSON.stringify(grid), workload: JSON.stringify(workload), members: JSON.stringify(members) }
}

describe('BR-98 isolation on the golden seed (AC-1413, M11-D34 (3))', () => {
  it('PERSON / NUMBER / DATE cells on the POS charter change nothing in planning; only `database` audit rows of POS', async () => {
    expect(GOLDEN_PATH).toContain('golden-fixtures.json')
    await seedGolden(db)
    const posId = await goldenProjectId('POS Upgrade')
    const mint = await goldenUser('Mint') // a POS member (AC-1413's example)
    const peter = await goldenUser('Peter') // not a POS member: picking him must not invite him (FR-1410 / BR-98)
    const [charter] = await db
      .select()
      .from(pages)
      .where(sql`${pages.projectId} = ${posId} and ${pages.isCharter} and ${pages.deletedAt} is null`)
    expect(charter, 'the POS charter (FR-402)').toBeDefined()

    const before = await planningState(posId)
    const memberIds = (JSON.parse(before.members) as { userId: string }[]).map((m) => m.userId)
    expect(memberIds).toContain(mint.id)
    expect(memberIds).not.toContain(peter.id)
    const tablesBefore = await otherTables()
    const auditBefore = await auditCount()

    asUser(await goldenUser('Manager'))
    const { databaseId } = ok(await createDatabase({ pageId: charter!.id, view: 'TABLE' }), 'createDatabase')
    const person = ok(
      await createDatabaseColumn({ databaseId, type: 'PERSON', name: 'ผู้รับผิดชอบ' }),
      'createDatabaseColumn PERSON',
    ).column
    const number = ok(
      await createDatabaseColumn({ databaseId, type: 'NUMBER', name: 'วัน' }),
      'createDatabaseColumn NUMBER',
    ).column
    const date = ok(await createDatabaseColumn({ databaseId, type: 'DATE', name: 'สัปดาห์' }), 'createDatabaseColumn DATE')
      .column
    const { rows } = ok(
      await createDatabaseRows({
        databaseId,
        rows: [{ title: 'งานของ Mint', cells: { [person.id]: [mint.id, peter.id], [number.id]: '5', [date.id]: THIS_WEEK } }],
      }),
      'createDatabaseRows',
    )
    ok(
      await updateDatabaseRow({ rowId: rows[0]!.id, baseVersion: rows[0]!.version, cells: { [number.id]: '5.5' } }),
      'updateDatabaseRow',
    )

    // BR-98: the grid, the workload and the members are byte-identical; so is every other table
    const after = await planningState(posId)
    expect(after.grid, 'POS grid chunk').toBe(before.grid)
    expect(after.workload, 'team workload (M9)').toBe(before.workload)
    expect(after.members, 'POS members (Peter not invited)').toBe(before.members)
    const tablesAfter = await otherTables()
    for (const [t, json] of tablesBefore) expect(tablesAfter.get(t), `table ${t}`).toBe(json)

    // FR-1466 / AC-1413: one audit row per action, all `database` rows of POS, without cell values
    const added = await auditRowsAfter(auditBefore)
    expect(added).toHaveLength(6)
    for (const a of added) expect(a).toMatchObject({ entity: 'database', entityId: databaseId, projectId: posId })
    expect(JSON.stringify(added)).not.toContain(peter.id)
    expect(JSON.stringify(added)).not.toContain('งานของ Mint')
  })
})
