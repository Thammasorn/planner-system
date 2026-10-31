import { readFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeUser } from '../../../tests/helpers/factories'
import { db } from './client'
import { clients, projectMembers, projects, taskStatuses, tasks } from './schema'

describe('database harness and migrations', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql.end()
  })

  it('runs on a per-worker clone of the migrated template', async () => {
    const [row] = await sql<{ db: string }[]>`select current_database() as db`
    expect(row?.db).toMatch(/^planner_t_[0-9a-f]{6}_w\d+$/)
  })

  it('has the M0 extensions', async () => {
    const rows = await sql<{ extname: string }[]>`select extname from pg_extension`
    expect(rows.map((r) => r.extname)).toEqual(expect.arrayContaining(['btree_gist', 'pg_trgm', 'pgcrypto']))
  })

  it('applied exactly the journaled migrations', async () => {
    const journal = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8'),
    ) as {
      entries: unknown[]
    }
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from drizzle.__drizzle_migrations`
    expect(row?.n).toBe(journal.entries.length)
  })

  it('orderKey collation sorts like JS <', async () => {
    const keys = ['a1', 'Zz', 'a0V', 'a0']
    await sql.begin(async (tx) => {
      await tx`create temp table k (p text collate "C") on commit drop`
      for (const p of keys) await tx`insert into k (p) values (${p})`
      const byteOrder = await tx<{ p: string }[]>`select p from k order by p`
      const localeOrder = await tx<{ p: string }[]>`select p from k order by p collate "en_US.utf8"`
      expect(byteOrder.map((r) => r.p)).toEqual(['Zz', 'a0', 'a0V', 'a1'])
      expect(byteOrder.map((r) => r.p)).toEqual([...keys].sort())
      // Why X48 exists: the database default (en_US.utf8) orders fractional-index keys differently.
      expect(localeOrder.map((r) => r.p)).toEqual(['a0', 'a0V', 'a1', 'Zz'])
    })
  })
})

describe('M2 schema (SPEC §6.2 clients / projects / project_members, §6.4)', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql.end()
  })

  it('has the trigram indexes', async () => {
    const rows = await sql<{ indexname: string }[]>`
      select indexname from pg_indexes where indexname in
        ('projects_name_trgm', 'clients_name_trgm', 'user_name_trgm', 'user_nickname_trgm', 'project_members_user_id_idx')`
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      'clients_name_trgm',
      'project_members_user_id_idx',
      'projects_name_trgm',
      'user_name_trgm',
      'user_nickname_trgm',
    ])
  })

  it('rejects duplicate client names including archived', async () => {
    await db.insert(clients).values({ name: 'Coral', archivedAt: new Date() })
    const err: unknown = await db
      .insert(clients)
      .values({ name: 'Coral' })
      .then(
        () => null,
        (e: unknown) => e,
      )
    expect(err).toBeInstanceOf(DrizzleQueryError)
    expect((err as DrizzleQueryError).cause).toMatchObject({
      code: '23505',
      constraint_name: 'clients_name_unique',
    })
  })

  it('sets client_id null when a client row is deleted', async () => {
    const u = await makeUser({ role: 'manager' })
    const [c] = await db.insert(clients).values({ name: 'Bluebird' }).returning()
    const [p] = await db.insert(projects).values({ name: 'X', clientId: c!.id, createdBy: u.id }).returning()
    await sql`delete from clients where id = ${c!.id}`
    const [after] = await db.select().from(projects).where(eq(projects.id, p!.id))
    expect(after?.clientId).toBeNull()
  })

  it('cascades project_members on project delete', async () => {
    const u = await makeUser({ role: 'manager' })
    const [p] = await db.insert(projects).values({ name: 'X', createdBy: u.id }).returning()
    await db.insert(projectMembers).values({ projectId: p!.id, userId: u.id, role: 'LEAD', addedBy: u.id })
    await sql`delete from projects where id = ${p!.id}`
    const rows = await db.select().from(projectMembers).where(eq(projectMembers.projectId, p!.id))
    expect(rows).toEqual([])
  })

  it('defaults: colour #2F5597, certainty CONFIRMED, member role MEMBER, timestamps set', async () => {
    const u = await makeUser({ role: 'manager' })
    const [p] = await db.insert(projects).values({ name: 'X', createdBy: u.id }).returning()
    expect(p).toMatchObject({ color: '#2F5597', certainty: 'CONFIRMED', archivedAt: null, deletedAt: null })
    expect(p?.createdAt).toBeInstanceOf(Date)
    const [m] = await db.insert(projectMembers).values({ projectId: p!.id, userId: u.id }).returning()
    expect(m).toMatchObject({ role: 'MEMBER', addedBy: null })
    const [c] = await db.insert(clients).values({ name: 'SCB' }).returning()
    expect(c).toMatchObject({ code: null, color: null, note: null, archivedAt: null })
  })
})

// ---------------------------------------------------------------------------------------------------------------
// M3 — task statuses, tasks, assignments, blockers (plan/m03 S0.3, M3-D36, BR-30/31/80/83/85, R6, R20)
// ---------------------------------------------------------------------------------------------------------------

describe('M3 schema (SPEC v3.1 §6.2 task_statuses / tasks / task_assignments / task_blockers)', () => {
  let sql: postgres.Sql
  const migrationSql = (): string => {
    const journal = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8'),
    ) as { entries: { tag: string }[] }
    const tag = journal.entries.find((e) => e.tag.endsWith('_m3_tasks'))?.tag
    if (!tag) throw new Error('m3_tasks migration missing from the journal')
    return readFileSync(path.resolve(process.cwd(), `drizzle/${tag}.sql`), 'utf8')
  }

  /** Postgres error `{ code, constraint }` of a failing statement, or null when it succeeds. */
  async function pgError(
    run: () => Promise<unknown>,
  ): Promise<{ code?: string; constraint?: string } | null> {
    try {
      await run()
      return null
    } catch (e) {
      const err = e as { code?: string; constraint_name?: string }
      return { code: err.code, constraint: err.constraint_name }
    }
  }

  async function seedProject(name = 'P'): Promise<{ projectId: string; userId: string }> {
    const u = await makeUser({ role: 'manager' })
    const [p] = await sql<{ id: string }[]>`
      insert into projects (name, created_by) values (${name}, ${u.id}) returning id`
    return { projectId: p!.id, userId: u.id }
  }

  async function seedStatus(
    projectId: string,
    name = 'ยังไม่เริ่ม',
    category = 'TODO',
    position = 'a0',
  ): Promise<string> {
    const [s] = await sql<{ id: string }[]>`
      insert into task_statuses (project_id, name, category, position)
      values (${projectId}, ${name}, ${category}, ${position}) returning id`
    return s!.id
  }

  async function seedTask(o: {
    projectId: string
    userId: string
    statusId: string
    name?: string
    parentId?: string | null
  }): Promise<string> {
    const [t] = await sql<{ id: string }[]>`
      insert into tasks (project_id, parent_id, name, status_id, position, created_by)
      values (${o.projectId}, ${o.parentId ?? null}, ${o.name ?? 'งาน'}, ${o.statusId}, 'a0', ${o.userId})
      returning id`
    return t!.id
  }

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql.end()
  })

  describe('tasks', () => {
    it('position is COLLATE "C"; tasks_name_trgm exists', async () => {
      const [col] = await sql<{ collname: string }[]>`
        select c.collname from pg_attribute a join pg_collation c on c.oid = a.attcollation
        where a.attrelid = 'tasks'::regclass and a.attname = 'position'`
      expect(col?.collname).toBe('C')
      const [idx] = await sql<
        { indexdef: string }[]
      >`select indexdef from pg_indexes where indexname = 'tasks_name_trgm'`
      expect(idx?.indexdef).toContain('gin_trgm_ops')
    })

    it('completed_week is the Monday of completed_on (generated, read-only — R6)', async () => {
      const { projectId, userId } = await seedProject()
      const statusId = await seedStatus(projectId)
      const id = await seedTask({ projectId, userId, statusId })
      const week = async (on: string | null) => {
        await sql`update tasks set completed_on = ${on} where id = ${id}`
        const [r] = await sql<
          { w: string | null }[]
        >`select completed_week::text as w from tasks where id = ${id}`
        return r?.w ?? null
      }
      expect(await week('2026-10-04')).toBe('2026-09-28')
      expect(await week('2027-01-01')).toBe('2026-12-28')
      expect(await week('2026-09-28')).toBe('2026-09-28')
      expect(await week(null)).toBeNull()
      expect(
        (await pgError(() => sql`update tasks set completed_week = '2026-09-28' where id = ${id}`))?.code,
      ).toBe('428C9')
    })

    it('checks depth 0..2, non-blank names and due ≥ start (23514)', async () => {
      const { projectId, userId } = await seedProject()
      const statusId = await seedStatus(projectId)
      const id = await seedTask({ projectId, userId, statusId })
      expect(await pgError(() => sql`update tasks set depth = 2 where id = ${id}`)).toBeNull()
      expect(await pgError(() => sql`update tasks set depth = 3 where id = ${id}`)).toMatchObject({
        code: '23514',
        constraint: 'tasks_depth_check',
      })
      expect(await pgError(() => sql`update tasks set name = '   ' where id = ${id}`)).toMatchObject({
        code: '23514',
        constraint: 'tasks_name_check',
      })
      expect(
        await pgError(
          () => sql`update tasks set start_date = '2026-10-05', due_date = '2026-10-01' where id = ${id}`,
        ),
      ).toMatchObject({ code: '23514', constraint: 'tasks_dates_check' })
      expect(
        await pgError(
          () => sql`update tasks set start_date = '2026-10-01', due_date = '2026-10-01' where id = ${id}`,
        ),
      ).toBeNull()
    })

    it('Drizzle maps plan dates to ISO strings and omits the generated column on insert', async () => {
      const { projectId, userId } = await seedProject()
      const statusId = await seedStatus(projectId)
      const [row] = await db
        .insert(tasks)
        .values({
          projectId,
          name: 'งาน',
          statusId,
          position: 'a0',
          createdBy: userId,
          startDate: '2026-09-28',
          dueDate: '2026-10-02',
          completedOn: '2026-10-01',
        })
        .returning()
      expect(row).toMatchObject({
        startDate: '2026-09-28',
        dueDate: '2026-10-02',
        completedOn: '2026-10-01',
        completedWeek: '2026-09-28',
        depth: 0,
        parentId: null,
        certaintyOverride: null,
      })
    })

    it('parent delete cascades the subtree', async () => {
      const { projectId, userId } = await seedProject()
      const statusId = await seedStatus(projectId)
      const parentId = await seedTask({ projectId, userId, statusId })
      await seedTask({ projectId, userId, statusId, parentId })
      await sql`delete from tasks where id = ${parentId}`
      const [r] = await sql<
        { n: number }[]
      >`select count(*)::int as n from tasks where project_id = ${projectId}`
      expect(r?.n).toBe(0)
    })
  })

  describe('task_assignments', () => {
    it('one active (task_id, user_id); allowed again after soft delete; cascades with the task', async () => {
      const { projectId, userId } = await seedProject()
      const statusId = await seedStatus(projectId)
      const taskId = await seedTask({ projectId, userId, statusId })
      const [first] = await sql<{ id: string; version: number }[]>`
        insert into task_assignments (task_id, user_id) values (${taskId}, ${userId}) returning id, version`
      expect(first?.version).toBe(1)
      expect(
        await pgError(
          () => sql`insert into task_assignments (task_id, user_id) values (${taskId}, ${userId})`,
        ),
      ).toMatchObject({ code: '23505', constraint: 'task_assignments_active' })
      await sql`update task_assignments set deleted_at = now() where id = ${first!.id}`
      expect(
        await pgError(
          () => sql`insert into task_assignments (task_id, user_id) values (${taskId}, ${userId})`,
        ),
      ).toBeNull()
      await sql`delete from tasks where id = ${taskId}`
      const [r] = await sql<
        { n: number }[]
      >`select count(*)::int as n from task_assignments where task_id = ${taskId}`
      expect(r?.n).toBe(0)
    })
  })

  describe('task_statuses (v3.1)', () => {
    it('the migration emits the enum, composite keys, the composite FK and the lower(name) index (M3-D36)', () => {
      const text = migrationSql()
      expect(text).toContain('CREATE TYPE "public"."task_status_category"')
      expect(text).toMatch(/"task_statuses_project_id_id_key" UNIQUE\("project_id","id"\)/)
      expect(text).toMatch(/"tasks_project_id_id_key" UNIQUE\("project_id","id"\)/)
      expect(text).toMatch(
        /"tasks_status_fk" FOREIGN KEY \("project_id","status_id"\) REFERENCES "public"\."task_statuses"\("project_id","id"\)/,
      )
      expect(text).toMatch(/CREATE UNIQUE INDEX "task_statuses_name" .*lower\("name"\).*deleted_at" is null/)
    })

    it('live names are unique per project case-insensitively (task_statuses_name)', async () => {
      const { projectId } = await seedProject('P')
      const { projectId: otherId } = await seedProject('Q')
      const doneId = await seedStatus(projectId, 'Done', 'DONE', 'a1')
      expect(await pgError(() => seedStatus(projectId, 'done', 'DONE', 'a2'))).toMatchObject({
        code: '23505',
        constraint: 'task_statuses_name',
      })
      expect(await pgError(() => seedStatus(otherId, 'done', 'DONE', 'a2'))).toBeNull()
      await sql`update task_statuses set deleted_at = now() where id = ${doneId}`
      expect(await pgError(() => seedStatus(projectId, 'done', 'DONE', 'a2'))).toBeNull()
    })

    it('rejects blank names (23514) and defaults the colour to #94A3B8', async () => {
      const { projectId } = await seedProject()
      expect(await pgError(() => seedStatus(projectId, '  '))).toMatchObject({
        code: '23514',
        constraint: 'task_statuses_name_check',
      })
      const id = await seedStatus(projectId)
      const [row] = await db.select().from(taskStatuses).where(eq(taskStatuses.id, id))
      expect(row).toMatchObject({ color: '#94A3B8', category: 'TODO', deletedAt: null, deletedBatch: null })
    })

    it('a task cannot use a status of another project (BR-83, 23503)', async () => {
      const { projectId, userId } = await seedProject('P')
      const { projectId: otherId } = await seedProject('Q')
      await seedStatus(projectId)
      const foreign = await seedStatus(otherId)
      expect(await pgError(() => seedTask({ projectId, userId, statusId: foreign }))).toMatchObject({
        code: '23503',
        constraint: 'tasks_status_fk',
      })
    })

    it('deleting the project removes statuses, tasks, assignments and edges in one statement', async () => {
      const { projectId, userId } = await seedProject()
      const statusId = await seedStatus(projectId)
      const a = await seedTask({ projectId, userId, statusId, name: 'A' })
      const b = await seedTask({ projectId, userId, statusId, name: 'B' })
      await sql`insert into task_assignments (task_id, user_id) values (${a}, ${userId})`
      await sql`insert into task_blockers (project_id, task_id, blocker_task_id, created_by)
                values (${projectId}, ${b}, ${a}, ${userId})`
      await sql`delete from projects where id = ${projectId}`
      const [r] = await sql<{ s: number; t: number; a: number; b: number }[]>`
        select (select count(*)::int from task_statuses) as s, (select count(*)::int from tasks) as t,
               (select count(*)::int from task_assignments) as a, (select count(*)::int from task_blockers) as b`
      expect(r).toEqual({ s: 0, t: 0, a: 0, b: 0 })
    })
  })

  describe('task_blockers (v3.1)', () => {
    it('rejects self edges (23514), cross-project edges (23503) and duplicate live edges (23505)', async () => {
      const { projectId, userId } = await seedProject('P')
      const { projectId: otherId, userId: otherUser } = await seedProject('Q')
      const statusId = await seedStatus(projectId)
      const otherStatus = await seedStatus(otherId)
      const a = await seedTask({ projectId, userId, statusId, name: 'A' })
      const b = await seedTask({ projectId, userId, statusId, name: 'B' })
      const q = await seedTask({ projectId: otherId, userId: otherUser, statusId: otherStatus, name: 'Q' })
      const edge = (p: string, t: string, blocker: string) =>
        sql`insert into task_blockers (project_id, task_id, blocker_task_id, created_by)
            values (${p}, ${t}, ${blocker}, ${userId}) returning id`
      expect(await pgError(() => edge(projectId, a, a))).toMatchObject({
        code: '23514',
        constraint: 'task_blockers_not_self',
      })
      expect((await pgError(() => edge(projectId, a, q)))?.code).toBe('23503')
      expect((await pgError(() => edge(otherId, a, q)))?.code).toBe('23503')
      const [first] = (await edge(projectId, b, a)) as unknown as { id: string }[]
      expect(await pgError(() => edge(projectId, b, a))).toMatchObject({
        code: '23505',
        constraint: 'task_blockers_active',
      })
      await sql`update task_blockers set deleted_at = now() where id = ${first!.id}`
      expect(await pgError(() => edge(projectId, b, a))).toBeNull()
    })

    it('deleting either task cascades the edge', async () => {
      const { projectId, userId } = await seedProject()
      const statusId = await seedStatus(projectId)
      const a = await seedTask({ projectId, userId, statusId, name: 'A' })
      const b = await seedTask({ projectId, userId, statusId, name: 'B' })
      const c = await seedTask({ projectId, userId, statusId, name: 'C' })
      await sql`insert into task_blockers (project_id, task_id, blocker_task_id, created_by)
                values (${projectId}, ${b}, ${a}, ${userId}), (${projectId}, ${c}, ${b}, ${userId})`
      await sql`delete from tasks where id = ${a}`
      await sql`delete from tasks where id = ${c}`
      const [r] = await sql<{ n: number }[]>`select count(*)::int as n from task_blockers`
      expect(r?.n).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------
// M4 — pages, page_locks, files (plan/m04 S0.3, DM-09, X10, M4-D25)
// ---------------------------------------------------------------------------------------------------------------

describe('pages / files / page_locks', () => {
  let sql: postgres.Sql

  async function pgError(
    run: () => Promise<unknown>,
  ): Promise<{ code?: string; constraint?: string } | null> {
    try {
      await run()
      return null
    } catch (e) {
      const err = e as { code?: string; constraint_name?: string }
      return { code: err.code, constraint: err.constraint_name }
    }
  }

  async function seedProject(): Promise<{ projectId: string; userId: string }> {
    const u = await makeUser({ role: 'manager' })
    const [p] = await sql<{ id: string }[]>`
      insert into projects (name, created_by) values ('P', ${u.id}) returning id`
    return { projectId: p!.id, userId: u.id }
  }

  function insertPage(o: {
    userId: string
    space?: 'WORKSPACE' | 'PROJECT'
    projectId?: string | null
    depth?: number
    isCharter?: boolean
  }) {
    return sql<{ id: string }[]>`
      insert into pages (space, project_id, depth, is_charter, position, created_by, updated_by)
      values (${o.space ?? 'WORKSPACE'}, ${o.projectId ?? null}, ${o.depth ?? 0}, ${o.isCharter ?? false}, 'a0',
              ${o.userId}, ${o.userId})
      returning id`
  }

  function insertFile(o: {
    userId: string
    projectId?: string | null
    pageId?: string | null
    kind?: string
  }) {
    return sql<{ id: string }[]>`
      insert into files (storage_key, original_name, mime, size_bytes, kind, page_id, project_id, uploaded_by)
      values (${'2026/09/' + crypto.randomUUID() + '.png'}, 'a.png', 'image/png', 1, ${o.kind ?? 'IMAGE'},
              ${o.pageId ?? null}, ${o.projectId ?? null}, ${o.userId})
      returning id`
  }

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql.end()
  })

  it('pages.position is COLLATE "C"', async () => {
    const [col] = await sql<{ collname: string }[]>`
      select c.collname from pg_attribute a join pg_collation c on c.oid = a.attcollation
      where a.attrelid = 'pages'::regclass and a.attname = 'position'`
    expect(col?.collname).toBe('C')
  })

  it('checks space ⇔ project_id and depth 0..9 (23514)', async () => {
    const { projectId, userId } = await seedProject()
    expect(await pgError(() => insertPage({ userId, space: 'WORKSPACE', projectId }))).toMatchObject({
      code: '23514',
      constraint: 'pages_space_project_check',
    })
    expect(await pgError(() => insertPage({ userId, space: 'PROJECT', projectId: null }))).toMatchObject({
      code: '23514',
      constraint: 'pages_space_project_check',
    })
    expect(await pgError(() => insertPage({ userId, depth: 10 }))).toMatchObject({
      code: '23514',
      constraint: 'pages_depth_check',
    })
    expect(await pgError(() => insertPage({ userId, depth: 9 }))).toBeNull()
    expect(await pgError(() => insertPage({ userId, space: 'PROJECT', projectId }))).toBeNull()
  })

  it('allows one live charter per project (23505); a soft-deleted charter frees the slot', async () => {
    const { projectId, userId } = await seedProject()
    const [first] = await insertPage({ userId, space: 'PROJECT', projectId, isCharter: true })
    expect(
      await pgError(() => insertPage({ userId, space: 'PROJECT', projectId, isCharter: true })),
    ).toMatchObject({
      code: '23505',
      constraint: 'one_charter_per_project',
    })
    await sql`update pages set deleted_at = now() where id = ${first!.id}`
    expect(
      await pgError(() => insertPage({ userId, space: 'PROJECT', projectId, isCharter: true })),
    ).toBeNull()
  })

  it('has the named indexes', async () => {
    const names = [
      'pages_tree_idx',
      'one_charter_per_project',
      'pages_title_trgm',
      'pages_content_trgm',
      'files_project_id_idx',
    ]
    const rows = await sql<
      { indexname: string }[]
    >`select indexname from pg_indexes where indexname in ${sql(names)}`
    expect(rows.map((r) => r.indexname).sort()).toEqual([...names].sort())
  })

  it('defaults: content [], content_text "", version 1, locked false', async () => {
    const u = await makeUser()
    const [p] = await insertPage({ userId: u.id })
    const [row] = await sql<
      { content: unknown; content_text: string; version: number; locked: boolean; title: string }[]
    >`
      select content, content_text, version, locked, title from pages where id = ${p!.id}`
    expect(row).toEqual({ content: [], content_text: '', version: 1, locked: false, title: '' })
  })

  it('files.kind check (23514); deleting a cover file nulls pages.cover_file_id', async () => {
    const u = await makeUser()
    expect(await pgError(() => insertFile({ userId: u.id, kind: 'OTHER' }))).toMatchObject({
      code: '23514',
      constraint: 'files_kind_check',
    })
    const [p] = await insertPage({ userId: u.id })
    const [f] = await insertFile({ userId: u.id, pageId: p!.id })
    await sql`update pages set cover_file_id = ${f!.id} where id = ${p!.id}`
    await sql`delete from files where id = ${f!.id}`
    const [row] = await sql<
      { cover_file_id: string | null }[]
    >`select cover_file_id from pages where id = ${p!.id}`
    expect(row?.cover_file_id).toBeNull()
  })

  it('deleting a project cascades its pages, files and page_locks', async () => {
    const { projectId, userId } = await seedProject()
    const [p] = await insertPage({ userId, space: 'PROJECT', projectId })
    const [f] = await insertFile({ userId, projectId, pageId: p!.id })
    await sql`update pages set cover_file_id = ${f!.id} where id = ${p!.id}`
    await sql`insert into page_locks (page_id, user_id, expires_at) values (${p!.id}, ${userId}, now() + interval '2 minutes')`
    await sql`delete from projects where id = ${projectId}`
    const [r] = await sql<{ pages: number; files: number; locks: number }[]>`
      select (select count(*)::int from pages where id = ${p!.id}) as pages,
             (select count(*)::int from files where id = ${f!.id}) as files,
             (select count(*)::int from page_locks where page_id = ${p!.id}) as locks`
    expect(r).toEqual({ pages: 0, files: 0, locks: 0 })
  })

  it('page_locks: one row per page (23505)', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const [p] = await insertPage({ userId: a.id })
    await sql`insert into page_locks (page_id, user_id, expires_at) values (${p!.id}, ${a.id}, now())`
    expect(
      await pgError(
        () => sql`insert into page_locks (page_id, user_id, expires_at) values (${p!.id}, ${b.id}, now())`,
      ),
    ).toMatchObject({ code: '23505' })
  })
})

describe('M5 schema (SPEC §6.2 holidays / leave_types / time_off + time_off_no_overlap)', () => {
  let sql: postgres.Sql

  async function pgError(
    run: () => Promise<unknown>,
  ): Promise<{ code?: string; constraint?: string } | null> {
    try {
      await run()
      return null
    } catch (e) {
      const err = e as { code?: string; constraint_name?: string }
      return { code: err.code, constraint: err.constraint_name }
    }
  }

  let typeSeq = 0
  async function seedLeaveType(name?: string): Promise<string> {
    typeSeq += 1
    const [t] = await sql<{ id: string }[]>`
      insert into leave_types (name, position) values (${name ?? `ประเภท ${typeSeq}`}, ${`a${typeSeq}`}) returning id`
    return t!.id
  }

  function insertLeave(o: {
    userId: string
    typeId: string
    start: string
    end?: string
    half?: 'AM' | 'PM' | null
  }) {
    return sql<{ id: string }[]>`
      insert into time_off (user_id, leave_type_id, start_date, end_date, half, created_by)
      values (${o.userId}, ${o.typeId}, ${o.start}, ${o.end ?? o.start}, ${o.half ?? null}, ${o.userId})
      returning id`
  }

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql.end()
  })

  it('pins the exclusion constraint', async () => {
    const rows = await sql<{ conname: string; contype: string }[]>`
      select conname, contype from pg_constraint where conname = 'time_off_no_overlap'`
    expect(rows).toEqual([{ conname: 'time_off_no_overlap', contype: 'x' }])
  })

  it('rejects overlapping live leave of the same user only', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const typeId = await seedLeaveType()
    await insertLeave({ userId: a.id, typeId, start: '2026-10-05', end: '2026-10-06' })
    expect(
      await pgError(() => insertLeave({ userId: a.id, typeId, start: '2026-10-06', end: '2026-10-08' })),
    ).toEqual({ code: '23P01', constraint: 'time_off_no_overlap' })
    expect(
      await pgError(() => insertLeave({ userId: b.id, typeId, start: '2026-10-05', end: '2026-10-06' })),
    ).toBeNull()
  })

  it('rejects AM + PM on the same date (r2 T3)', async () => {
    const a = await makeUser()
    const typeId = await seedLeaveType()
    await insertLeave({ userId: a.id, typeId, start: '2026-10-20', half: 'AM' })
    expect(
      await pgError(() => insertLeave({ userId: a.id, typeId, start: '2026-10-20', half: 'PM' })),
    ).toEqual({
      code: '23P01',
      constraint: 'time_off_no_overlap',
    })
  })

  it('ignores soft-deleted rows; clearing deleted_at again conflicts (r2 T2b)', async () => {
    const a = await makeUser()
    const typeId = await seedLeaveType()
    const [first] = await insertLeave({ userId: a.id, typeId, start: '2026-10-12', end: '2026-10-13' })
    await sql`update time_off set deleted_at = now(), deleted_batch = gen_random_uuid() where id = ${first!.id}`
    expect(
      await pgError(() => insertLeave({ userId: a.id, typeId, start: '2026-10-13', end: '2026-10-14' })),
    ).toBeNull()
    expect(
      await pgError(
        () => sql`update time_off set deleted_at = null, deleted_batch = null where id = ${first!.id}`,
      ),
    ).toEqual({ code: '23P01', constraint: 'time_off_no_overlap' })
  })

  it('checks: half only on a single date; end >= start', async () => {
    const a = await makeUser()
    const typeId = await seedLeaveType()
    expect(
      await pgError(() =>
        insertLeave({ userId: a.id, typeId, start: '2026-10-05', end: '2026-10-06', half: 'AM' }),
      ),
    ).toEqual({ code: '23514', constraint: 'time_off_half_check' })
    expect(
      await pgError(() => insertLeave({ userId: a.id, typeId, start: '2026-10-06', end: '2026-10-05' })),
    ).toEqual({ code: '23514', constraint: 'time_off_range_check' })
  })

  it('unique holiday date / leave type name (archived included)', async () => {
    await sql`insert into holidays (date, name) values ('2026-10-23', 'วันปิยมหาราช')`
    expect(await pgError(() => sql`insert into holidays (date, name) values ('2026-10-23', 'ซ้ำ')`)).toEqual({
      code: '23505',
      constraint: 'holidays_date_unique',
    })
    await sql`insert into leave_types (name, position, archived_at) values ('ลาเก่า', 'b0', now())`
    expect(
      await pgError(() => sql`insert into leave_types (name, position) values ('ลาเก่า', 'b1')`),
    ).toEqual({ code: '23505', constraint: 'leave_types_name_unique' })
  })

  it('leave_types defaults; position uses collation C', async () => {
    const [col] = await sql<{ collation_name: string | null }[]>`
      select collation_name from information_schema.columns
      where table_name = 'leave_types' and column_name = 'position'`
    expect(col?.collation_name).toBe('C')
    const [t] = await sql<{ color: string; archived_at: Date | null }[]>`
      insert into leave_types (name, position) values ('สีเริ่มต้น', 'c0') returning color, archived_at`
    expect(t).toEqual({ color: '#94A3B8', archived_at: null })
  })

  it('a leave type in use cannot be deleted (23503); deleting the user cascades its leave', async () => {
    const a = await makeUser()
    const recorder = await makeUser({ role: 'manager' })
    const typeId = await seedLeaveType()
    const [leave] = await insertLeave({ userId: a.id, typeId, start: '2026-11-02' })
    expect(await pgError(() => sql`delete from leave_types where id = ${typeId}`)).toMatchObject({
      code: '23503',
    })
    // created_by has no cascade: recorded by someone else so only the owner's ON DELETE cascade is exercised
    await sql`update time_off set created_by = ${recorder.id} where id = ${leave!.id}`
    await sql`delete from "user" where id = ${a.id}`
    const [r] = await sql<{ n: number }[]>`select count(*)::int as n from time_off where id = ${leave!.id}`
    expect(r?.n).toBe(0)
  })
})
