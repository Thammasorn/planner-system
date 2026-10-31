// M2 S1.2 — project / client authorization and §3.3 visibility helpers (M2-D01, M2-D02, X42, X43).
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { makeProject, makeUser } from '../../tests/helpers/factories'
import { toSessionUser } from '../../tests/helpers/as-user'
import { createWorld, type World } from '../../tests/helpers/world'
import {
  canSeeUserDetails,
  isLeadAnywhere,
  projectAccess,
  requireClient,
  requireProject,
  requireTimeOffEdit,
  visibleProjectIds,
  visibleUserIds,
} from './authz'
import { db } from './db/client'
import { projectMembers } from './db/schema'
import { ForbiddenError, NotFoundError } from './errors'

const S = toSessionUser

async function world(): Promise<World> {
  return createWorld()
}

describe('projectAccess', () => {
  it('manager → MANAGER (also when a member); archived flag follows the project', async () => {
    const w = await world()
    expect(await projectAccess(db, S(w.manager), w.P.id)).toEqual({ role: 'MANAGER', archived: false })
    await db
      .insert(projectMembers)
      .values({ projectId: w.P.id, userId: w.manager.id, role: 'LEAD', addedBy: null })
    expect(await projectAccess(db, S(w.manager), w.P.id)).toEqual({ role: 'MANAGER', archived: false })
    expect(await projectAccess(db, S(w.manager), w.A.id)).toEqual({ role: 'MANAGER', archived: true })
  })

  it('lead / member → LEAD / MEMBER; archived A → archived: true', async () => {
    const w = await world()
    expect(await projectAccess(db, S(w.lead), w.P.id)).toEqual({ role: 'LEAD', archived: false })
    expect(await projectAccess(db, S(w.member), w.P.id)).toEqual({ role: 'MEMBER', archived: false })
    expect(await projectAccess(db, S(w.lead), w.A.id)).toEqual({ role: 'LEAD', archived: true })
  })

  it('outsider → null', async () => {
    const w = await world()
    expect(await projectAccess(db, S(w.outsider), w.P.id)).toBeNull()
  })

  it('unknown / malformed id → null without a DB error', async () => {
    const w = await world()
    expect(await projectAccess(db, S(w.manager), randomUUID())).toBeNull()
    expect(await projectAccess(db, S(w.manager), 'abc')).toBeNull()
    expect(await projectAccess(db, S(w.lead), "'; drop table projects; --")).toBeNull()
  })
})

describe('requireProject', () => {
  it('view by outsider → NotFoundError', async () => {
    const w = await world()
    await expect(requireProject(db, S(w.outsider), w.P.id, 'view')).rejects.toBeInstanceOf(NotFoundError)
    await expect(requireProject(db, S(w.outsider), 'abc', 'manage')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('view of an archived project is allowed for its members', async () => {
    const w = await world()
    await expect(requireProject(db, S(w.member), w.A.id, 'view')).resolves.toEqual({
      role: 'MEMBER',
      archived: true,
    })
  })

  it('manage by member → ForbiddenError; edit by member → ok', async () => {
    const w = await world()
    await expect(requireProject(db, S(w.member), w.P.id, 'manage')).rejects.toBeInstanceOf(ForbiddenError)
    await expect(requireProject(db, S(w.member), w.P.id, 'edit')).resolves.toMatchObject({ role: 'MEMBER' })
    await expect(requireProject(db, S(w.lead), w.P.id, 'manage')).resolves.toMatchObject({ role: 'LEAD' })
  })

  it('edit / manage on archived → ForbiddenError "โปรเจคถูก archive แล้ว" (manager too)', async () => {
    const w = await world()
    for (const [u, need] of [
      [w.lead, 'edit'],
      [w.lead, 'manage'],
      [w.manager, 'manage'],
      [w.member, 'edit'],
    ] as const) {
      const err = await requireProject(db, S(u), w.A.id, need).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ForbiddenError)
      expect((err as ForbiddenError).message).toBe(th.projects.errors.archivedReadOnly)
    }
  })

  it('owner: lead → ForbiddenError; manager on archived A → ok', async () => {
    const w = await world()
    await expect(requireProject(db, S(w.lead), w.P.id, 'owner')).rejects.toBeInstanceOf(ForbiddenError)
    await expect(requireProject(db, S(w.manager), w.A.id, 'owner')).resolves.toEqual({
      role: 'MANAGER',
      archived: true,
    })
  })

  it('allowArchived: lead manage on A → ok; member → ForbiddenError', async () => {
    const w = await world()
    await expect(
      requireProject(db, S(w.lead), w.A.id, 'manage', { allowArchived: true }),
    ).resolves.toMatchObject({ role: 'LEAD', archived: true })
    await expect(
      requireProject(db, S(w.member), w.A.id, 'manage', { allowArchived: true }),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('requireClient', () => {
  it('members see their projects’ clients only; manager sees all; malformed → 404', async () => {
    const w = await world()
    await expect(requireClient(db, S(w.lead), w.C1.id)).resolves.toEqual({ clientId: w.C1.id })
    await expect(requireClient(db, S(w.lead), w.C2.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(requireClient(db, S(w.outsider), w.C2.id)).resolves.toEqual({ clientId: w.C2.id })
    await expect(requireClient(db, S(w.member), w.C3.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(requireClient(db, S(w.manager), w.C3.id)).resolves.toEqual({ clientId: w.C3.id })
    await expect(requireClient(db, S(w.manager), randomUUID())).rejects.toBeInstanceOf(NotFoundError)
    await expect(requireClient(db, S(w.manager), 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('a client whose only shared project is archived stays visible', async () => {
    const w = await world()
    const solo = await makeUser({ nickname: 'Solo' })
    await makeProject({ client: w.C2, members: [solo], archived: true, createdBy: w.manager })
    await expect(requireClient(db, S(solo), w.C2.id)).resolves.toEqual({ clientId: w.C2.id })
  })
})

describe('visibleProjectIds', () => {
  it("manager → 'ALL'; lead → {P, A}; outsider → {Q}", async () => {
    const w = await world()
    expect(await visibleProjectIds(db, S(w.manager))).toBe('ALL')
    expect(await visibleProjectIds(db, S(w.lead))).toEqual(new Set([w.P.id, w.A.id]))
    expect(await visibleProjectIds(db, S(w.outsider))).toEqual(new Set([w.Q.id]))
  })
})

describe('isLeadAnywhere', () => {
  it('lead → true; member → false; LEAD only of an archived project → false', async () => {
    const w = await world()
    expect(await isLeadAnywhere(db, S(w.lead))).toBe(true)
    expect(await isLeadAnywhere(db, S(w.member))).toBe(false)
    const archivedLead = await makeUser({ nickname: 'OldLead' })
    await makeProject({ lead: archivedLead, archived: true, createdBy: w.manager })
    expect(await isLeadAnywhere(db, S(archivedLead))).toBe(false)
  })
})

describe('visibleUserIds / canSeeUserDetails', () => {
  it("manager / lead → 'ALL'; member → {member, lead}; outsider → {outsider}", async () => {
    const w = await world()
    expect(await visibleUserIds(db, S(w.manager))).toBe('ALL')
    expect(await visibleUserIds(db, S(w.lead))).toBe('ALL')
    expect(await visibleUserIds(db, S(w.member))).toEqual(new Set([w.member.id, w.lead.id]))
    expect(await visibleUserIds(db, S(w.outsider))).toEqual(new Set([w.outsider.id]))
  })

  it('a deactivated co-member is included', async () => {
    const w = await world()
    const d = await makeUser({ nickname: 'Gone', deactivated: { on: '2026-09-01' } })
    await db.insert(projectMembers).values({ projectId: w.P.id, userId: d.id, role: 'MEMBER', addedBy: null })
    const set = await visibleUserIds(db, S(w.member))
    expect(set).not.toBe('ALL')
    expect((set as Set<string>).has(d.id)).toBe(true)
  })

  it('archived shared projects add nothing', async () => {
    const w = await world()
    const x = await makeUser({ nickname: 'X' })
    await makeProject({ members: [w.outsider, x], archived: true, createdBy: w.manager })
    expect(await visibleUserIds(db, S(w.outsider))).toEqual(new Set([w.outsider.id]))
  })

  it('canSeeUserDetails follows visibleUserIds', async () => {
    const w = await world()
    expect(await canSeeUserDetails(db, S(w.member), w.outsider.id)).toBe(false)
    expect(await canSeeUserDetails(db, S(w.lead), w.outsider.id)).toBe(true)
    expect(await canSeeUserDetails(db, S(w.member), w.lead.id)).toBe(true)
    expect(await canSeeUserDetails(db, S(w.member), w.member.id)).toBe(true)
    expect(await canSeeUserDetails(db, S(w.manager), w.outsider.id)).toBe(true)
  })
})

describe('requireTimeOffEdit (M5-D3, PERM-20/21)', () => {
  const outcome = async (p: Promise<void>): Promise<'ok' | '404' | '403'> => {
    try {
      await p
      return 'ok'
    } catch (e) {
      if (e instanceof NotFoundError) return '404'
      if (e instanceof ForbiddenError) return '403'
      throw e
    }
  }

  it('self → ok; manager → ok for an existing user, 404 otherwise; worker → 404 when invisible, else 403', async () => {
    const w = await createWorld({ with: ['timeOff'] })
    const coworker = w.users.coworker!
    const pOnly = w.users.pOnly!
    expect(await outcome(requireTimeOffEdit(db, S(w.manager), coworker.id))).toBe('ok')
    expect(await outcome(requireTimeOffEdit(db, S(w.manager), 'nope'))).toBe('404')
    expect(await outcome(requireTimeOffEdit(db, S(w.member), w.member.id))).toBe('ok')
    expect(await outcome(requireTimeOffEdit(db, S(w.member), coworker.id))).toBe('403')
    expect(await outcome(requireTimeOffEdit(db, S(w.outsider), pOnly.id))).toBe('404')
    expect(await outcome(requireTimeOffEdit(db, S(w.outsider), coworker.id))).toBe('403')
    expect(await outcome(requireTimeOffEdit(db, S(w.lead), pOnly.id))).toBe('403')
    expect(await outcome(requireTimeOffEdit(db, S(w.lead), 'nope'))).toBe('404')
    expect(await outcome(requireTimeOffEdit(db, S(w.member), randomUUID()))).toBe('404')
  })
})
