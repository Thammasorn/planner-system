// M2 S1.5 — projects (FR-401, FR-405 part, FR-406 part, FR-407, FR-409 part, M2-D03, M2-D17, M2-D20, X26).
import { randomUUID } from 'node:crypto'
import { access, rm } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import {
  archiveProject,
  createProject as createProjectAction,
  deleteProjectPermanently,
  unarchiveProject,
  updateProject as updateProjectAction,
} from '../actions/projects'
import { asUser, toSessionUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { makeFile, makePage, makeProject, makeUser } from '../../../tests/helpers/factories'
import { testCache } from '../../../tests/helpers/request'
import { createWorld } from '../../../tests/helpers/world'
import { goldenProjectId, goldenUser, type GoldenProject } from '../../../tests/authz/_support/golden'
import { seedGolden } from '../../../scripts/lib/fixtures'
import { completeTask } from '../actions/tasks'
import { tasks } from '../db/schema'
import { db } from '../db/client'
import { auditLog, files, projectMembers, projects } from '../db/schema'
import { NotFoundError } from '../errors'
import * as services from '../services'
import { getProjectHeader, getProjectOverview, listProjectsForViewer } from './projects'
import { getSidebar } from './sidebar'

const S = toSessionUser

async function membersOf(projectId: string) {
  return db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId))
}

describe('create', () => {
  it('manager creates with client, TENTATIVE and a LEAD: one LEAD row, exactly one audit row', async () => {
    const w = await createWorld()
    asUser(w.manager)
    const mark = await auditCount()
    const res = await createProjectAction({
      name: 'ระบบจองห้องประชุม',
      clientId: w.C1.id,
      certainty: 'TENTATIVE',
      leadUserId: w.member.id,
    })
    if (!res.ok) throw new Error(res.message)
    const [p] = await db.select().from(projects).where(eq(projects.id, res.projectId))
    expect(p).toMatchObject({
      name: 'ระบบจองห้องประชุม',
      clientId: w.C1.id,
      certainty: 'TENTATIVE',
      color: '#2F5597',
      createdBy: w.manager.id,
    })
    expect(await membersOf(res.projectId)).toEqual([
      expect.objectContaining({ userId: w.member.id, role: 'LEAD', addedBy: w.manager.id }),
    ])
    const rows = await auditRowsAfter(mark)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ entity: 'project', action: 'create', projectId: res.projectId })
    expect(rows[0]!.after).toMatchObject({ leadUserId: w.member.id, certainty: 'TENTATIVE' })
    expect(testCache.refresh).not.toHaveBeenCalled()
  })

  it('without a LEAD: no member rows and the overview warns noLead', async () => {
    const w = await createWorld()
    asUser(w.manager)
    const res = await createProjectAction({ name: 'Solo', color: '#0f766e' })
    if (!res.ok) throw new Error(res.message)
    expect(await membersOf(res.projectId)).toEqual([])
    const ov = await getProjectOverview(db, S(w.manager), res.projectId)
    expect(ov.warnings.noLead).toBe(true)
    expect(ov.project.color).toBe('#0F766E')
  })

  it('archived / unknown client and a deactivated LEAD → VALIDATION; worker → FORBIDDEN', async () => {
    const w = await createWorld()
    const gone = await makeUser({ nickname: 'Gone', deactivated: { on: '2026-09-01' } })
    asUser(w.manager)
    expect(await createProjectAction({ name: 'x', clientId: w.C3.id })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.projects.errors.clientArchived,
      fieldErrors: { clientId: [th.projects.errors.clientArchived] },
    })
    expect(await createProjectAction({ name: 'x', clientId: randomUUID() })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.projects.errors.clientNotFound,
    })
    expect(await createProjectAction({ name: 'x', leadUserId: gone.id })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.projects.errors.leadInactive,
    })
    asUser(w.lead)
    expect(await createProjectAction({ name: 'x' })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await db.select().from(projects).where(eq(projects.name, 'x'))).toEqual([])
  })
})

describe('update', () => {
  it('lead renames P: audit carries only the changed column; refresh called', async () => {
    const w = await createWorld()
    asUser(w.lead)
    const mark = await auditCount()
    expect(await updateProjectAction({ projectId: w.P.id, name: 'P2' })).toEqual({
      ok: true,
      certaintyChanged: false,
    })
    const rows = await auditRowsAfter(mark)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entity: 'project',
      action: 'update',
      projectId: w.P.id,
      before: { name: 'World P' },
      after: { name: 'P2' },
      summary: th.audit.projectUpdated('P2'),
    })
    expect(testCache.refresh).toHaveBeenCalledTimes(1)
  })

  it('clientId: null clears; switching to an archived client fails; keeping the current archived client is fine', async () => {
    const w = await createWorld()
    asUser(w.lead)
    expect(await updateProjectAction({ projectId: w.P.id, clientId: w.C3.id })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.projects.errors.clientArchived,
    })
    await db.transaction((tx) => services.clients.setClientArchived(tx, w.C1.id, true))
    expect(await updateProjectAction({ projectId: w.P.id, clientId: w.C1.id, name: 'Keep' })).toMatchObject({
      ok: true,
    })
    expect(await updateProjectAction({ projectId: w.P.id, clientId: null })).toMatchObject({ ok: true })
    const [p] = await db.select().from(projects).where(eq(projects.id, w.P.id))
    expect(p).toMatchObject({ name: 'Keep', clientId: null })
  })

  it('certainty: TENTATIVE → certaintyChanged true; unchanged → false (no audit row)', async () => {
    const w = await createWorld()
    asUser(w.manager)
    expect(await updateProjectAction({ projectId: w.P.id, certainty: 'TENTATIVE' })).toEqual({
      ok: true,
      certaintyChanged: true,
    })
    expect(testCache.refresh).toHaveBeenCalledTimes(1)
    const mark = await auditCount()
    expect(await updateProjectAction({ projectId: w.P.id, certainty: 'TENTATIVE' })).toEqual({
      ok: true,
      certaintyChanged: false,
    })
    expect(await auditRowsAfter(mark)).toEqual([])
  })

  it('member → 403, archived A → 403 (read-only), outsider → 404', async () => {
    const w = await createWorld()
    asUser(w.member)
    expect(await updateProjectAction({ projectId: w.P.id, name: 'x' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    asUser(w.lead)
    expect(await updateProjectAction({ projectId: w.A.id, name: 'x' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
      message: th.projects.errors.archivedReadOnly,
    })
    asUser(w.outsider)
    expect(await updateProjectAction({ projectId: w.P.id, name: 'x' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
  })
})

describe('archive / unarchive', () => {
  it('lead archives P: hidden from the sidebar, overview read-only; second archive → 403; unarchive restores', async () => {
    const w = await createWorld()
    asUser(w.lead)
    expect(await archiveProject({ projectId: w.P.id })).toEqual({ ok: true, changed: true, releasedCd: 0 })
    const [p] = await db.select().from(projects).where(eq(projects.id, w.P.id))
    expect(p!.archivedAt).not.toBeNull()
    expect((await getSidebar(db, S(w.member), '2026-09-30')).projects.map((x) => x.id)).not.toContain(w.P.id)
    const ov = await getProjectOverview(db, S(w.member), w.P.id)
    expect(ov.project.archived).toBe(true)
    expect(ov.project.can.manage).toBe(false)
    expect((await getProjectHeader(db, S(w.lead), w.P.id)).can).toEqual({
      manage: false,
      unarchive: true,
      delete: false,
    })
    expect(await archiveProject({ projectId: w.P.id })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(await unarchiveProject({ projectId: w.P.id })).toEqual({ ok: true, changed: true })
    const [q] = await db.select().from(projects).where(eq(projects.id, w.P.id))
    expect(q!.archivedAt).toBeNull()
  })

  it('unarchive of an active project → { changed: false } and no audit row; member → 403', async () => {
    const w = await createWorld()
    asUser(w.lead)
    const mark = await auditCount()
    expect(await unarchiveProject({ projectId: w.P.id })).toEqual({ ok: true, changed: false })
    expect(await auditRowsAfter(mark)).toEqual([])
    asUser(w.member)
    expect(await unarchiveProject({ projectId: w.A.id })).toMatchObject({ ok: false, code: 'FORBIDDEN' })
  })
})

describe('delete', () => {
  it('manager deletes P (name trimmed): rows cascade, audit survives, unlink after commit with []', async () => {
    const w = await createWorld()
    const collect = vi.spyOn(services.projects, 'collectProjectFileKeys')
    const unlink = vi.spyOn(services.projects, 'unlinkFilesBestEffort')
    asUser(w.manager)
    expect(await deleteProjectPermanently({ projectId: w.P.id, confirmName: '  World P ' })).toEqual({
      ok: true,
    })
    expect(await db.select().from(projects).where(eq(projects.id, w.P.id))).toEqual([])
    expect(await membersOf(w.P.id)).toEqual([])
    const audits = await db.select().from(auditLog).where(eq(auditLog.projectId, w.P.id))
    expect(audits).toEqual([expect.objectContaining({ entity: 'project', action: 'delete' })])
    expect(collect).toHaveBeenCalledTimes(1)
    expect(unlink).toHaveBeenCalledExactlyOnceWith([])
    expect(collect.mock.invocationCallOrder[0]!).toBeLessThan(unlink.mock.invocationCallOrder[0]!)
    expect(testCache.refresh).not.toHaveBeenCalled()
  })

  it('wrong name → VALIDATION, nothing deleted; lead → 403; outsider → 404; archived A by manager → ok', async () => {
    const w = await createWorld()
    asUser(w.manager)
    expect(await deleteProjectPermanently({ projectId: w.P.id, confirmName: 'World' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: th.projects.errors.deleteNameMismatch,
    })
    expect(await db.select().from(projects).where(eq(projects.id, w.P.id))).toHaveLength(1)
    asUser(w.lead)
    expect(await deleteProjectPermanently({ projectId: w.P.id, confirmName: 'World P' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    asUser(w.outsider)
    expect(await deleteProjectPermanently({ projectId: w.P.id, confirmName: 'World P' })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    })
    asUser(w.manager)
    expect(await deleteProjectPermanently({ projectId: w.A.id, confirmName: 'World A' })).toEqual({
      ok: true,
    })
  })
})

describe('delete removes files (FR-407, X26, M4 S1.10)', () => {
  it('two files on disk are gone after the permanent delete; rows cascade', async () => {
    const w = await createWorld()
    const page = await makePage({ project: w.P, title: 'หน้ามีไฟล์', createdBy: w.manager })
    const f1 = await makeFile({ page, uploadedBy: w.manager })
    const f2 = await makeFile({ page, uploadedBy: w.manager, kind: 'ATTACHMENT' })
    const onDisk = (key: string) => access(path.join(process.env.UPLOAD_DIR!, key)).then(() => true, () => false)
    expect(await onDisk(f1.storageKey)).toBe(true)
    asUser(w.manager)
    expect(await deleteProjectPermanently({ projectId: w.P.id, confirmName: 'World P' })).toEqual({ ok: true })
    expect(await db.select().from(files).where(eq(files.projectId, w.P.id))).toEqual([])
    expect(await onDisk(f1.storageKey)).toBe(false)
    expect(await onDisk(f2.storageKey)).toBe(false)
  })

  it('a missing file does not fail the delete', async () => {
    const w = await createWorld()
    const page = await makePage({ project: w.P, createdBy: w.manager })
    const f = await makeFile({ page, uploadedBy: w.manager })
    await rm(path.join(process.env.UPLOAD_DIR!, f.storageKey))
    const warn = vi.spyOn(console, 'warn')
    asUser(w.manager)
    expect(await deleteProjectPermanently({ projectId: w.P.id, confirmName: 'World P' })).toEqual({ ok: true })
    expect(warn).not.toHaveBeenCalled() // ENOENT is ignored by storage.remove
    await expect(services.projects.unlinkFilesBestEffort(['../../etc/passwd'])).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('loaders', () => {
  it('listProjectsForViewer by role and archived mode; list item shape', async () => {
    const w = await createWorld()
    const ids = async (u: typeof w.lead, archived: boolean) =>
      (await listProjectsForViewer(db, S(u), { archived })).map((p) => p.id)
    expect(await ids(w.lead, false)).toEqual([w.P.id])
    expect(await ids(w.lead, true)).toEqual([w.A.id])
    expect(await ids(w.manager, false)).toEqual([w.P.id, w.Q.id])
    expect(await ids(w.manager, true)).toEqual([w.A.id])
    expect(await ids(w.outsider, true)).toEqual([])
    const [p] = await listProjectsForViewer(db, S(w.lead), { archived: false })
    expect(p).toMatchObject({
      name: 'World P',
      memberCount: 2,
      myRole: 'LEAD',
      archived: false,
      client: { id: w.C1.id, name: 'World C1', archived: false },
    })
    expect(p!.leads.map((l) => l.userId)).toEqual([w.lead.id])
    expect(Object.keys(p!.leads[0]!).sort()).toEqual([
      'active',
      'color',
      'name',
      'nickname',
      'positionName',
      'userId',
    ])
    expect((await listProjectsForViewer(db, S(w.manager), { archived: false }))[0]!.myRole).toBe('MANAGER')
  })

  it('overview: LEAD first then display name, member role, can all false; outsider → 404', async () => {
    const w = await createWorld()
    const aaa = await makeUser({ name: 'Aaa', nickname: 'Aaa' })
    await db
      .insert(projectMembers)
      .values({ projectId: w.P.id, userId: aaa.id, role: 'MEMBER', addedBy: null })
    const ov = await getProjectOverview(db, S(w.member), w.P.id)
    expect(ov.members.map((m) => [m.userId, m.role])).toEqual([
      [w.lead.id, 'LEAD'],
      [aaa.id, 'MEMBER'],
      [w.member.id, 'MEMBER'],
    ])
    expect(ov.project.myRole).toBe('MEMBER')
    expect(ov.project.can).toEqual({ manage: false, unarchive: false, delete: false })
    expect(ov.warnings.noLead).toBe(false)
    await expect(getProjectOverview(db, S(w.outsider), w.P.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(getProjectOverview(db, S(w.manager), 'abc')).rejects.toBeInstanceOf(NotFoundError)
    expect((await getProjectOverview(db, S(w.manager), w.Q.id)).warnings.noLead).toBe(true)
  })

  it('a project whose only LEAD is deactivated → noLead (M2-D17)', async () => {
    const w = await createWorld()
    const gone = await makeUser({ nickname: 'Gone', deactivated: { on: '2026-09-01' } })
    const p = await makeProject({ lead: gone, members: [w.member], createdBy: w.manager })
    const ov = await getProjectOverview(db, S(w.member), p.id)
    expect(ov.warnings.noLead).toBe(true)
    expect(ov.members.find((m) => m.userId === gone.id)).toMatchObject({ role: 'LEAD', active: false })
  })

  it('header: manager can delete; lead manages P', async () => {
    const w = await createWorld()
    expect((await getProjectHeader(db, S(w.manager), w.P.id)).can).toEqual({
      manage: true,
      unarchive: false,
      delete: true,
    })
    expect((await getProjectHeader(db, S(w.lead), w.P.id)).can.manage).toBe(true)
  })
})

// ── M6 S2.8 — FR-406 X (X17, M6-D17): archive returns the counted future load (BR-50), this week included ─────────
describe('archiveProject › archive X (M6)', () => {
  const archiveAs = async (project: GoldenProject) => {
    vi.stubEnv('ALLOW_TEST_HOOKS', '1')
    vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
    asUser(await goldenUser('Manager'))
    return archiveProject({ projectId: await goldenProjectId(project) })
  }

  it('golden: POS 2500 · Store 3500 · DW 1625 (week 09-28 included, r8 §6.3)', async () => {
    await seedGolden(db)
    expect(await archiveAs('POS Upgrade')).toEqual({ ok: true, changed: true, releasedCd: 2500 })
    expect(await archiveAs('Store Analytics Dashboard')).toEqual({ ok: true, changed: true, releasedCd: 3500 })
    expect(await archiveAs('Data Warehouse')).toEqual({ ok: true, changed: true, releasedCd: 1625 })
  })

  it('BR-50: Rollout สาขา completed first → POS 625; a project without plans → 0', async () => {
    await seedGolden(db)
    vi.stubEnv('ALLOW_TEST_HOOKS', '1')
    vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
    asUser(await goldenUser('Cindy'))
    const [rollout] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.name, 'Rollout สาขา'))
    expect(await completeTask({ taskIds: [rollout!.id] })).toMatchObject({ ok: true })
    expect(await archiveAs('POS Upgrade')).toEqual({ ok: true, changed: true, releasedCd: 625 })
    const manager = await goldenUser('Manager')
    const empty = await makeProject({ name: 'ว่าง', createdBy: manager })
    asUser(manager)
    expect(await archiveProject({ projectId: empty.id })).toEqual({ ok: true, changed: true, releasedCd: 0 })
  })
})
