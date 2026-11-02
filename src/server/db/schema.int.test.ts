import { readFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeUser } from '../../../tests/helpers/factories'
import { db } from './client'
import { clients, milestones, planMarkers, projectMembers, projects, taskStatuses, tasks } from './schema'

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

describe('M6 schema (SPEC §6.2 allocations, §6.3 trigger + allocations_one_resolution_per_week)', () => {
  let sql: postgres.Sql

  /** Postgres error `{ code, constraint, message }` of a failing statement, or null when it succeeds. */
  async function pgError(
    run: () => Promise<unknown>,
  ): Promise<{ code?: string; constraint?: string; message?: string } | null> {
    try {
      await run()
      return null
    } catch (e) {
      const err = e as { code?: string; constraint_name?: string; message?: string }
      return { code: err.code, constraint: err.constraint_name, message: err.message }
    }
  }

  /** A fresh live assignment (project → status → task → assignment). */
  async function seedAssignment(): Promise<string> {
    const u = await makeUser({ role: 'manager' })
    const [p] = await sql<{ id: string }[]>`
      insert into projects (name, created_by) values (${'P'}, ${u.id}) returning id`
    const [s] = await sql<{ id: string }[]>`
      insert into task_statuses (project_id, name, category, position)
      values (${p!.id}, ${'s'}, 'TODO', 'a0') returning id`
    const [t] = await sql<{ id: string }[]>`
      insert into tasks (project_id, name, status_id, position, created_by)
      values (${p!.id}, ${'งาน'}, ${s!.id}, 'a0', ${u.id}) returning id`
    const [a] = await sql<{ id: string }[]>`
      insert into task_assignments (task_id, user_id) values (${t!.id}, ${u.id}) returning id`
    return a!.id
  }

  function insert(o: { ta: string; g: 'WEEK' | 'DAY'; period: string; week: string; pd: string }) {
    return sql`
      insert into allocations (task_assignment_id, granularity, period_start, week_start, person_days)
      values (${o.ta}, ${o.g}, ${o.period}, ${o.week}, ${o.pd})`
  }

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql.end()
  })

  it('pins the exclusion constraint and the BR-20b trigger', async () => {
    const rows = await sql<{ conname: string; contype: string }[]>`
      select conname, contype from pg_constraint where conname = 'allocations_one_resolution_per_week'`
    expect(rows).toEqual([{ conname: 'allocations_one_resolution_per_week', contype: 'x' }])
    const [trg] = await sql<{ n: number }[]>`
      select count(*)::int as n from pg_trigger
      where tgname = 'trg_week_day_exclusivity' and tgrelid = 'allocations'::regclass`
    expect(trg?.n).toBe(1)
  })

  it('WEEK on a Monday ok; week_start not Monday → 23514', async () => {
    const ta = await seedAssignment()
    expect(
      await pgError(() => insert({ ta, g: 'WEEK', period: '2026-09-28', week: '2026-09-28', pd: '2.50' })),
    ).toBeNull()
    expect(
      await pgError(() => insert({ ta, g: 'WEEK', period: '2026-09-29', week: '2026-09-29', pd: '1.00' })),
    ).toMatchObject({ code: '23514', constraint: 'allocations_week_start_check' })
  })

  it('period checks: WEEK period ≠ week, WEEK > 7, DAY > 1, DAY outside the week → 23514', async () => {
    const ta = await seedAssignment()
    const bad = { code: '23514', constraint: 'allocations_period_check' }
    expect(
      await pgError(() => insert({ ta, g: 'WEEK', period: '2026-10-06', week: '2026-10-05', pd: '1.00' })),
    ).toMatchObject(bad)
    expect(
      await pgError(() => insert({ ta, g: 'WEEK', period: '2026-10-05', week: '2026-10-05', pd: '7.25' })),
    ).toMatchObject(bad)
    expect(
      await pgError(() => insert({ ta, g: 'DAY', period: '2026-10-12', week: '2026-10-12', pd: '1.25' })),
    ).toMatchObject(bad)
    expect(
      await pgError(() => insert({ ta, g: 'DAY', period: '2026-10-19', week: '2026-10-12', pd: '0.50' })),
    ).toMatchObject(bad)
    // Sunday = week_start + 6 is still inside the week
    expect(
      await pgError(() => insert({ ta, g: 'DAY', period: '2026-10-18', week: '2026-10-12', pd: '1.00' })),
    ).toBeNull()
  })

  it('person_days 0 → 23514; duplicate (assignment, granularity, period) → 23505', async () => {
    const ta = await seedAssignment()
    expect(
      await pgError(() => insert({ ta, g: 'WEEK', period: '2026-10-05', week: '2026-10-05', pd: '0' })),
    ).toMatchObject({ code: '23514', constraint: 'allocations_person_days_check' })
    await insert({ ta, g: 'WEEK', period: '2026-10-05', week: '2026-10-05', pd: '1.00' })
    expect(
      await pgError(() => insert({ ta, g: 'WEEK', period: '2026-10-05', week: '2026-10-05', pd: '2.00' })),
    ).toMatchObject({ code: '23505', constraint: 'allocations_ta_granularity_period_key' })
  })

  it('DAY in a week that has WEEK → P0001 WEEK_DAY_CONFLICT (trigger fires before the constraint)', async () => {
    const ta = await seedAssignment()
    await insert({ ta, g: 'WEEK', period: '2026-10-05', week: '2026-10-05', pd: '3.00' })
    const err = await pgError(() =>
      insert({ ta, g: 'DAY', period: '2026-10-06', week: '2026-10-05', pd: '0.50' }),
    )
    expect(err?.code).toBe('P0001')
    expect(err?.message).toMatch(/^WEEK_DAY_CONFLICT/)
    // the other direction too
    await insert({ ta, g: 'DAY', period: '2026-10-13', week: '2026-10-12', pd: '0.50' })
    expect(
      (await pgError(() => insert({ ta, g: 'WEEK', period: '2026-10-12', week: '2026-10-12', pd: '1.00' })))
        ?.code,
    ).toBe('P0001')
  })

  it('DELETE WEEK then INSERT DAY in one transaction succeeds (SPEC §6.3)', async () => {
    const ta = await seedAssignment()
    await insert({ ta, g: 'WEEK', period: '2026-10-05', week: '2026-10-05', pd: '1.00' })
    await sql.begin(async (tx) => {
      await tx`delete from allocations where task_assignment_id = ${ta} and week_start = '2026-10-05'`
      await tx`
        insert into allocations (task_assignment_id, granularity, period_start, week_start, person_days)
        values (${ta}, 'DAY', '2026-10-05', '2026-10-05', '0.50'), (${ta}, 'DAY', '2026-10-06', '2026-10-05', '0.50')`
    })
    const rows = await sql<{ g: string; n: number }[]>`
      select granularity::text as g, count(*)::int as n from allocations
      where task_assignment_id = ${ta} and week_start >= '2026-10-05' and week_start < '2026-10-12'
      group by granularity`
    expect(rows).toEqual([{ g: 'DAY', n: 2 }])
  })

  it('deleting the assignment cascades its allocations', async () => {
    const ta = await seedAssignment()
    await insert({ ta, g: 'WEEK', period: '2026-10-05', week: '2026-10-05', pd: '1.00' })
    await sql`delete from task_assignments where id = ${ta}`
    const [r] = await sql<{ n: number }[]>`
      select count(*)::int as n from allocations
      where task_assignment_id = ${ta} and week_start >= '2026-10-05' and week_start < '2026-10-12'`
    expect(r?.n).toBe(0)
  })

  it('numeric(4,2) rounds 0.125 to 0.13 (documented, harmless: BR-27 values are multiples of 0.25)', async () => {
    const ta = await seedAssignment()
    await insert({ ta, g: 'DAY', period: '2026-10-07', week: '2026-10-05', pd: '0.125' })
    const [r] = await sql<{ pd: string }[]>`
      select person_days::text as pd from allocations
      where task_assignment_id = ${ta} and week_start >= '2026-10-05' and week_start < '2026-10-12'`
    expect(r?.pd).toBe('0.13')
  })
})

describe('M6.1 schema (SPEC §6.2 page_kind, pages.kind / task_id / full_width, tasks.notes dropped)', () => {
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

  /** user → project → status → task; returns ids. */
  async function seedTask(): Promise<{ projectId: string; userId: string; taskId: string }> {
    const u = await makeUser({ role: 'manager' })
    const [p] = await sql<{ id: string }[]>`
      insert into projects (name, created_by) values ('P', ${u.id}) returning id`
    const [s] = await sql<{ id: string }[]>`
      insert into task_statuses (project_id, name, category, position)
      values (${p!.id}, 's', 'TODO', 'a0') returning id`
    const [t] = await sql<{ id: string }[]>`
      insert into tasks (project_id, name, status_id, position, created_by)
      values (${p!.id}, 'งาน', ${s!.id}, 'a0', ${u.id}) returning id`
    return { projectId: p!.id, userId: u.id, taskId: t!.id }
  }

  function insertTaskPage(o: {
    userId: string
    projectId: string | null
    taskId: string | null
    kind?: 'DOC' | 'TASK'
    space?: 'WORKSPACE' | 'PROJECT'
    parentId?: string | null
    title?: string
    locked?: boolean
    depth?: number
    isCharter?: boolean
  }) {
    return sql<{ id: string }[]>`
      insert into pages (space, project_id, kind, task_id, parent_id, title, locked, depth, is_charter, position,
                         created_by, updated_by)
      values (${o.space ?? 'PROJECT'}, ${o.projectId}, ${o.kind ?? 'TASK'}, ${o.taskId}, ${o.parentId ?? null},
              ${o.title ?? ''}, ${o.locked ?? false}, ${o.depth ?? 0}, ${o.isCharter ?? false}, 'a0',
              ${o.userId}, ${o.userId})
      returning id`
  }

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql.end()
  })

  it('page_kind has DOC, TASK (+ DB_ROW since M11)', async () => {
    const rows = await sql<{ v: string }[]>`select unnest(enum_range(null::page_kind))::text as v`
    expect(rows.map((r) => r.v)).toEqual(['DOC', 'TASK', 'DB_ROW'])
  })

  it('defaults: kind DOC, task_id null, full_width false; pages_tree_idx covers DOC pages only', async () => {
    const u = await makeUser()
    const [p] = await sql<{ id: string }[]>`
      insert into pages (space, position, created_by, updated_by) values ('WORKSPACE', 'a0', ${u.id}, ${u.id})
      returning id`
    const [row] = await sql<{ kind: string; task_id: string | null; full_width: boolean }[]>`
      select kind, task_id, full_width from pages where id = ${p!.id}`
    expect(row).toEqual({ kind: 'DOC', task_id: null, full_width: false })
    const [idx] = await sql<{ def: string }[]>`
      select indexdef as def from pg_indexes where indexname = 'pages_tree_idx'`
    expect(idx?.def).toMatch(/deleted_at IS NULL\) AND \(kind = 'DOC'/)
  })

  it('a TASK page is valid at project root; kind ⇔ task_id (pages_kind_task)', async () => {
    const { projectId, userId, taskId } = await seedTask()
    expect(await pgError(() => insertTaskPage({ userId, projectId, taskId }))).toBeNull()
    const other = await seedTask()
    expect(
      await pgError(() => insertTaskPage({ userId, projectId: other.projectId, taskId: null })),
    ).toMatchObject({ code: '23514', constraint: 'pages_kind_task' })
    expect(
      await pgError(() =>
        insertTaskPage({ userId, projectId: other.projectId, taskId: other.taskId, kind: 'DOC' }),
      ),
    ).toMatchObject({ code: '23514', constraint: 'pages_kind_task' })
  })

  it('TASK shape: no parent, depth 0, no charter, not locked, empty title (pages_kind_shape); PROJECT space', async () => {
    const { projectId, userId, taskId } = await seedTask()
    const [parent] = await insertTaskPage({ userId, projectId, taskId: null, kind: 'DOC' })
    const cases: Parameters<typeof insertTaskPage>[0][] = [
      { userId, projectId, taskId, parentId: parent!.id },
      { userId, projectId, taskId, title: 'ชื่อ' },
      { userId, projectId, taskId, locked: true },
      { userId, projectId, taskId, depth: 1 },
      { userId, projectId, taskId, isCharter: true },
    ]
    for (const c of cases)
      expect(await pgError(() => insertTaskPage(c))).toMatchObject({
        code: '23514',
        constraint: 'pages_kind_shape',
      })
    expect(
      await pgError(() => insertTaskPage({ userId, projectId: null, taskId, space: 'WORKSPACE' })),
    ).toMatchObject({ code: '23514', constraint: 'pages_task_space' })
  })

  it('one body per task (pages_task_id_unique, 23505), soft-deleted included', async () => {
    const { projectId, userId, taskId } = await seedTask()
    const [first] = await insertTaskPage({ userId, projectId, taskId })
    await sql`update pages set deleted_at = now() where id = ${first!.id}`
    expect(await pgError(() => insertTaskPage({ userId, projectId, taskId }))).toMatchObject({
      code: '23505',
      constraint: 'pages_task_id_unique',
    })
  })

  it('deleting the task row cascades its page', async () => {
    const { projectId, userId, taskId } = await seedTask()
    const [p] = await insertTaskPage({ userId, projectId, taskId })
    await sql`delete from tasks where id = ${taskId}`
    const [r] = await sql<{ n: number }[]>`select count(*)::int as n from pages where id = ${p!.id}`
    expect(r?.n).toBe(0)
  })

  it('tasks has no notes column (FR-692)', async () => {
    const cols = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns where table_name = 'tasks' and column_name = 'notes'`
    expect(cols).toEqual([])
  })
})

describe('M7.1 schema (SPEC §6.2 plan_marker_color, plan_markers)', () => {
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

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql.end()
  })

  it('plan_marker_color has exactly RED, YELLOW, GREEN', async () => {
    const rows = await sql<{ v: string }[]>`select unnest(enum_range(null::plan_marker_color))::text as v`
    expect(rows.map((r) => r.v)).toEqual(['RED', 'YELLOW', 'GREEN'])
  })

  it('insert/select round-trip through Drizzle: date as ISO string, default colour RED, label null', async () => {
    const { projectId, userId } = await seedProject()
    const [row] = await db
      .insert(planMarkers)
      .values({ projectId, date: '2026-10-23', createdBy: userId })
      .returning()
    expect(row).toMatchObject({ projectId, date: '2026-10-23', color: 'RED', label: null, deletedAt: null })
    const [again] = await db.select().from(planMarkers).where(eq(planMarkers.id, row!.id))
    expect(again?.date).toBe('2026-10-23')
    await db
      .update(planMarkers)
      .set({ color: 'GREEN', label: 'UAT sign-off' })
      .where(eq(planMarkers.id, row!.id))
    const [upd] = await db.select().from(planMarkers).where(eq(planMarkers.id, row!.id))
    expect(upd).toMatchObject({ color: 'GREEN', label: 'UAT sign-off' })
  })

  it("label check: '  ' and 81 chars violate plan_markers_label_check; 80 chars ok", async () => {
    const { projectId, userId } = await seedProject()
    const ins = (label: string) =>
      sql`insert into plan_markers (project_id, date, label, created_by)
          values (${projectId}, '2026-10-23', ${label}, ${userId})`
    for (const bad of ['  ', '', 'ก'.repeat(81)])
      expect(await pgError(() => ins(bad))).toMatchObject({
        code: '23514',
        constraint: 'plan_markers_label_check',
      })
    expect(await pgError(() => ins('ก'.repeat(80)))).toBeNull()
  })

  it('partial index (project_id, date) where deleted_at is null', async () => {
    const [idx] = await sql<{ def: string }[]>`
      select indexdef as def from pg_indexes where indexname = 'plan_markers_project_id_date_idx'`
    expect(idx?.def).toMatch(/\(project_id, date\) WHERE \(deleted_at IS NULL\)/)
  })

  it('project hard delete cascades its markers', async () => {
    const { projectId, userId } = await seedProject()
    await db.insert(planMarkers).values({ projectId, date: '2026-11-06', color: 'YELLOW', createdBy: userId })
    await sql`delete from projects where id = ${projectId}`
    const [r] = await sql<
      { n: number }[]
    >`select count(*)::int as n from plan_markers where project_id = ${projectId}`
    expect(r?.n).toBe(0)
  })
})

describe('M8 schema (SPEC §6.2 milestones, tasks.milestone_id; plan/m08 S0.2, M8-D2)', () => {
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

  async function seedProject(): Promise<{ projectId: string; userId: string; statusId: string }> {
    const u = await makeUser({ role: 'manager' })
    const [p] = await sql<{ id: string }[]>`
      insert into projects (name, created_by) values ('P', ${u.id}) returning id`
    const [s] = await sql<{ id: string }[]>`
      insert into task_statuses (project_id, name, category, position)
      values (${p!.id}, 'ยังไม่เริ่ม', 'TODO', 'a0') returning id`
    return { projectId: p!.id, userId: u.id, statusId: s!.id }
  }

  async function seedTask(
    o: { projectId: string; userId: string; statusId: string },
    milestoneId: string | null,
  ): Promise<string> {
    const [t] = await sql<{ id: string }[]>`
      insert into tasks (project_id, name, status_id, position, created_by, milestone_id)
      values (${o.projectId}, 'งาน', ${o.statusId}, 'a0', ${o.userId}, ${milestoneId}) returning id`
    return t!.id
  }

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql.end()
  })

  it("insert/select round-trip through Drizzle: date as the string '2026-10-23', nullable fields null", async () => {
    const { projectId, userId } = await seedProject()
    const [row] = await db
      .insert(milestones)
      .values({ projectId, name: 'UAT sign-off', date: '2026-10-23', createdBy: userId })
      .returning()
    expect(row).toMatchObject({
      projectId,
      name: 'UAT sign-off',
      date: '2026-10-23',
      description: null,
      completedOn: null,
      deletedAt: null,
      deletedBatch: null,
    })
    const [again] = await db.select().from(milestones).where(eq(milestones.id, row!.id))
    expect(again?.date).toBe('2026-10-23')
    expect(typeof again?.date).toBe('string')
  })

  it("name '  ' violates milestones_name_check (23514)", async () => {
    const { projectId, userId } = await seedProject()
    expect(
      await pgError(
        () => sql`insert into milestones (project_id, name, date, created_by)
                  values (${projectId}, '  ', '2026-10-23', ${userId})`,
      ),
    ).toMatchObject({ code: '23514', constraint: 'milestones_name_check' })
  })

  it('a task with an unknown milestone_id violates the FK (23503)', async () => {
    const o = await seedProject()
    const err = await pgError(() => seedTask(o, '00000000-0000-4000-8000-000000000001'))
    expect(err).toMatchObject({ code: '23503' })
  })

  it('DELETE FROM milestones sets the bound task milestone_id to null; the task survives', async () => {
    const o = await seedProject()
    const [m] = await db
      .insert(milestones)
      .values({ projectId: o.projectId, name: 'M', date: '2026-10-23', createdBy: o.userId })
      .returning()
    const taskId = await seedTask(o, m!.id)
    await sql`delete from milestones where id = ${m!.id}`
    const [t] = await db.select({ milestoneId: tasks.milestoneId }).from(tasks).where(eq(tasks.id, taskId))
    expect(t).toEqual({ milestoneId: null })
  })

  it('DELETE FROM projects removes its milestone and the bound task in one statement (cascade)', async () => {
    const o = await seedProject()
    const [m] = await db
      .insert(milestones)
      .values({ projectId: o.projectId, name: 'M', date: '2026-10-23', createdBy: o.userId })
      .returning()
    const taskId = await seedTask(o, m!.id)
    await sql`delete from projects where id = ${o.projectId}`
    const [r] = await sql<{ m: number; t: number }[]>`
      select (select count(*)::int from milestones where id = ${m!.id}) as m,
             (select count(*)::int from tasks where id = ${taskId}) as t`
    expect(r).toEqual({ m: 0, t: 0 })
  })

  it('named partial indexes exist', async () => {
    const rows = await sql<{ name: string; def: string }[]>`
      select indexname as name, indexdef as def from pg_indexes
      where indexname in ('milestones_project_id_date_idx', 'milestones_deleted_batch_idx', 'tasks_milestone_id_idx')
      order by indexname`
    expect(rows.map((r) => r.name)).toEqual([
      'milestones_deleted_batch_idx',
      'milestones_project_id_date_idx',
      'tasks_milestone_id_idx',
    ])
    const def = Object.fromEntries(rows.map((r) => [r.name, r.def]))
    expect(def.milestones_project_id_date_idx).toMatch(/\(project_id, date\) WHERE \(deleted_at IS NULL\)/)
    expect(def.milestones_deleted_batch_idx).toMatch(/\(deleted_batch\) WHERE \(deleted_batch IS NOT NULL\)/)
    expect(def.tasks_milestone_id_idx).toMatch(/\(milestone_id\) WHERE \(deleted_at IS NULL\)/)
  })

  it('tasks.milestone_id is a nullable uuid', async () => {
    const [c] = await sql<{ data_type: string; is_nullable: string }[]>`
      select data_type, is_nullable from information_schema.columns
      where table_name = 'tasks' and column_name = 'milestone_id'`
    expect(c).toEqual({ data_type: 'uuid', is_nullable: 'YES' })
  })
})

describe('M11 schema (SPEC §6.2 databases / database_columns / database_views / database_rows, pages.database_row_id)', () => {
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

  /** user → WORKSPACE DOC page → database (+ TITLE column) → one row. */
  async function seedDb(): Promise<{
    userId: string
    pageId: string
    databaseId: string
    rowId: string
    titleColumnId: string
  }> {
    const u = await makeUser()
    const [p] = await sql<{ id: string }[]>`
      insert into pages (space, title, position, created_by, updated_by)
      values ('WORKSPACE', 'เจ้าของ', 'a0', ${u.id}, ${u.id}) returning id`
    const [d] = await sql<{ id: string }[]>`
      insert into databases (page_id, title, created_by, updated_by)
      values (${p!.id}, 'ฐานข้อมูล', ${u.id}, ${u.id}) returning id`
    const [c] = await sql<{ id: string }[]>`
      insert into database_columns (database_id, type, name, position)
      values (${d!.id}, 'TITLE', 'ชื่อ', 'a0') returning id`
    const [r] = await sql<{ id: string }[]>`
      insert into database_rows (database_id, title, position, created_by, updated_by)
      values (${d!.id}, 'แถว', 'a0', ${u.id}, ${u.id}) returning id`
    return { userId: u.id, pageId: p!.id, databaseId: d!.id, rowId: r!.id, titleColumnId: c!.id }
  }

  function insertRowPage(o: { userId: string; rowId: string | null; kind?: 'DOC' | 'DB_ROW' }) {
    return sql<{ id: string }[]>`
      insert into pages (space, kind, database_row_id, position, created_by, updated_by)
      values ('WORKSPACE', ${o.kind ?? 'DB_ROW'}, ${o.rowId}, 'a0', ${o.userId}, ${o.userId})
      returning id`
  }

  const count = async (table: string, id: string): Promise<number> => {
    const [r] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql(table)} where id = ${id}`
    return r!.n
  }

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  })

  afterAll(async () => {
    await sql.end()
  })

  it('db_column_type and db_view_type values are exactly SPEC §6.2', async () => {
    const cols = await sql<{ v: string }[]>`select unnest(enum_range(null::db_column_type))::text as v`
    expect(cols.map((r) => r.v)).toEqual([
      'TITLE',
      'TEXT',
      'NUMBER',
      'SELECT',
      'MULTI_SELECT',
      'DATE',
      'CHECKBOX',
      'PERSON',
      'URL',
    ])
    const views = await sql<{ v: string }[]>`select unnest(enum_range(null::db_view_type))::text as v`
    expect(views.map((r) => r.v)).toEqual(['TABLE', 'KANBAN', 'CALENDAR'])
  })

  it('pages_kind_row: DB_ROW needs database_row_id, DOC may not have one; one page per row (23514, 23514, 23505)', async () => {
    const { userId, rowId } = await seedDb()
    expect(await pgError(() => insertRowPage({ userId, rowId: null }))).toMatchObject({
      code: '23514',
      constraint: 'pages_kind_row',
    })
    expect(await pgError(() => insertRowPage({ userId, rowId, kind: 'DOC' }))).toMatchObject({
      code: '23514',
      constraint: 'pages_kind_row',
    })
    expect(await pgError(() => insertRowPage({ userId, rowId }))).toBeNull()
    expect(await pgError(() => insertRowPage({ userId, rowId }))).toMatchObject({
      code: '23505',
      constraint: 'pages_database_row_id_unique',
    })
  })

  it('pages_kind_shape applies to DB_ROW pages (no title, no parent)', async () => {
    const { userId, rowId } = await seedDb()
    expect(
      await pgError(
        () => sql`insert into pages (space, kind, database_row_id, title, position, created_by, updated_by)
                  values ('WORKSPACE', 'DB_ROW', ${rowId}, 'x', 'a0', ${userId}, ${userId})`,
      ),
    ).toMatchObject({ code: '23514', constraint: 'pages_kind_shape' })
  })

  it('deleting a database_rows row cascades its body page', async () => {
    const { userId, rowId } = await seedDb()
    const [body] = await insertRowPage({ userId, rowId })
    await sql`delete from database_rows where id = ${rowId}`
    expect(await count('pages', body!.id)).toBe(0)
  })

  it('deleting the owner page cascades databases → columns / views / rows → row-body pages', async () => {
    const { userId, pageId, databaseId, rowId, titleColumnId } = await seedDb()
    const [v] = await sql<{ id: string }[]>`
      insert into database_views (database_id, type, name, position) values (${databaseId}, 'TABLE', 'ตาราง', 'a0')
      returning id`
    const [body] = await insertRowPage({ userId, rowId })
    await sql`delete from pages where id = ${pageId}`
    expect(await count('databases', databaseId)).toBe(0)
    expect(await count('database_columns', titleColumnId)).toBe(0)
    expect(await count('database_views', v!.id)).toBe(0)
    expect(await count('database_rows', rowId)).toBe(0)
    expect(await count('pages', body!.id)).toBe(0)
  })

  it('database_columns_one_title rejects a second TITLE (23505); a TITLE column cannot be soft-deleted (23514)', async () => {
    const { databaseId, titleColumnId } = await seedDb()
    expect(
      await pgError(
        () => sql`insert into database_columns (database_id, type, name, position)
                  values (${databaseId}, 'TITLE', 'ชื่อ 2', 'a1')`,
      ),
    ).toMatchObject({ code: '23505', constraint: 'database_columns_one_title' })
    expect(
      await pgError(() => sql`update database_columns set deleted_at = now() where id = ${titleColumnId}`),
    ).toMatchObject({ code: '23514', constraint: 'database_columns_title_not_deleted' })
  })

  it('cells must be a JSON object; title / name lengths are enforced', async () => {
    const { userId, databaseId, rowId } = await seedDb()
    expect(
      await pgError(() => sql`update database_rows set cells = '[]'::jsonb where id = ${rowId}`),
    ).toMatchObject({ code: '23514', constraint: 'database_rows_cells_object' })
    expect(
      await pgError(() => sql`update database_rows set title = ${'ก'.repeat(501)} where id = ${rowId}`),
    ).toMatchObject({ code: '23514', constraint: 'database_rows_title_len' })
    expect(
      await pgError(() => sql`update database_rows set title = ${'ก'.repeat(500)} where id = ${rowId}`),
    ).toBeNull()
    expect(
      await pgError(() => sql`update databases set title = ${'ก'.repeat(201)} where id = ${databaseId}`),
    ).toMatchObject({ code: '23514', constraint: 'databases_title_len' })
    for (const name of ['   ', 'ก'.repeat(101)]) {
      expect(
        await pgError(
          () => sql`insert into database_columns (database_id, type, name, position)
                    values (${databaseId}, 'TEXT', ${name}, 'a1')`,
        ),
      ).toMatchObject({ code: '23514', constraint: 'database_columns_name_len' })
      expect(
        await pgError(
          () => sql`insert into database_views (database_id, type, name, position)
                    values (${databaseId}, 'TABLE', ${name}, 'a1')`,
        ),
      ).toMatchObject({ code: '23514', constraint: 'database_views_name_len' })
    }
    // defaults
    const [row] = await sql<{ cells: unknown; version: number }[]>`
      insert into database_rows (database_id, position, created_by, updated_by)
      values (${databaseId}, 'a1', ${userId}, ${userId}) returning cells, version`
    expect(row).toEqual({ cells: {}, version: 1 })
  })

  it('the four tables reference only pages, databases and "user" (BR-98, M11-D34)', async () => {
    const rows = await sql<{ src: string; dst: string }[]>`
      select c.conrelid::regclass::text as src, c.confrelid::regclass::text as dst
      from pg_constraint c
      where c.contype = 'f'
        and c.conrelid::regclass::text in ('databases', 'database_columns', 'database_views', 'database_rows')`
    const targets = [...new Set(rows.map((r) => r.dst))].sort()
    expect(targets).toEqual(['"user"', 'databases', 'pages'])
  })

  it('has every SPEC §6.2/§6.4 index plus the three batch indexes, by name', async () => {
    const names = [
      'databases_page_id_idx',
      'databases_title_trgm',
      'database_columns_one_title',
      'database_columns_db_pos_idx',
      'database_columns_batch_idx',
      'database_views_db_pos_idx',
      'database_views_batch_idx',
      'database_rows_db_pos_idx',
      'database_rows_title_trgm',
      'database_rows_batch_idx',
      'pages_database_row_id_unique',
    ]
    const rows = await sql<{ indexname: string; indexdef: string }[]>`
      select indexname, indexdef from pg_indexes where indexname = any(${names})`
    expect(rows.map((r) => r.indexname).sort()).toEqual([...names].sort())
    const def = (n: string) => rows.find((r) => r.indexname === n)!.indexdef
    expect(def('database_rows_db_pos_idx')).toMatch(/deleted_at IS NULL/)
    expect(def('database_rows_batch_idx')).toMatch(/deleted_batch IS NOT NULL/)
    expect(def('database_rows_title_trgm')).toMatch(/gin .*gin_trgm_ops/)
  })

  it('positions are byte-ordered (orderKey, X48)', async () => {
    const rows = await sql<{ table_name: string; collation_name: string | null }[]>`
      select table_name, collation_name from information_schema.columns
      where column_name = 'position' and table_name in ('database_columns', 'database_views', 'database_rows')`
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.collation_name === 'C')).toBe(true)
  })

  it("title ilike '%ลูกค้า%' on database_rows uses database_rows_title_trgm", async () => {
    const plan = await sql.begin(async (tx) => {
      await tx`set local enable_seqscan = off`
      return tx<{ 'QUERY PLAN': string }[]>`explain select id from database_rows where title ilike '%ลูกค้า%'`
    })
    expect(plan.map((r) => r['QUERY PLAN']).join('\n')).toContain('database_rows_title_trgm')
  })
})
