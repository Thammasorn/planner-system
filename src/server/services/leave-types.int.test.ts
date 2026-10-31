// M5 S2.3 — leave types (FR-902, M5-D9/D10/D12, X48): ordered keys under the scope lock, move, delete-or-archive,
// same-id restore, last-active guard, unique names (archived included), bootstrap defaults, GET /api/leave-types.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/leave-types/route'
import { th } from '@/i18n/th'
import type { LeaveTypesResponse } from '@/lib/contracts/leave-types'
import { createLeaveType as createLeaveTypeAction } from '@/server/actions/leave-types'
import { asNobody, asUser } from '../../../tests/helpers/as-user'
import { makeLeaveType, makeTimeOff, makeUser } from '../../../tests/helpers/factories'
import { testCache } from '../../../tests/helpers/request'
import { db } from '../db/client'
import { auditLog, leaveTypes } from '../db/schema'
import { AppError } from '../errors'
import {
  createLeaveType,
  deleteLeaveType,
  ensureDefaultLeaveTypes,
  listLeaveTypes,
  moveLeaveType,
  restoreLeaveType,
  setLeaveTypeArchived,
  updateLeaveType,
} from './leave-types'

async function caught(p: Promise<unknown>): Promise<AppError> {
  try {
    await p
  } catch (e) {
    if (e instanceof AppError) return e
    throw e
  }
  throw new Error('expected an AppError')
}

const tx = <T>(fn: Parameters<typeof db.transaction<T>>[0]) => db.transaction(fn)
const names = async (includeArchived = true) =>
  (await listLeaveTypes(db, { includeArchived })).map((t) => t.name)
const leaveTypeAudits = () => db.select().from(auditLog).where(eq(auditLog.entity, 'leave_type'))

describe('leave types service (FR-902)', () => {
  it('create A, B, C → ordered by strictly increasing keys (byte order); move C up twice → C, A, B', async () => {
    const ids: Record<string, string> = {}
    for (const name of ['A', 'B', 'C'])
      ids[name] = (await tx((t) => createLeaveType(t, null, { name, color: '#0369A1' }))).id
    const list = await listLeaveTypes(db, { includeArchived: true })
    expect(list.map((t) => t.name)).toEqual(['A', 'B', 'C'])
    const keys = list.map((t) => t.position)
    expect(new Set(keys).size).toBe(3)
    expect([...keys].sort((a, b) => (Buffer.from(a) < Buffer.from(b) ? -1 : 1))).toEqual(keys)
    expect(list[0]).toEqual({
      id: ids.A,
      name: 'A',
      color: '#0369A1',
      archived: false,
      position: keys[0],
      usageCount: 0,
    })
    await tx((t) => moveLeaveType(t, null, { id: ids.C!, direction: 'up' }))
    await tx((t) => moveLeaveType(t, null, { id: ids.C!, direction: 'up' }))
    expect(await names()).toEqual(['C', 'A', 'B'])
    const before = (await leaveTypeAudits()).length
    await tx((t) => moveLeaveType(t, null, { id: ids.C!, direction: 'up' })) // first → no-op, no audit
    expect((await leaveTypeAudits()).length).toBe(before)
  })

  it('update renames / recolours with one audit row; duplicate name (also vs archived) → CONFLICT nameTaken', async () => {
    const a = await makeLeaveType({ name: 'A' })
    await makeLeaveType({ name: 'เก่า', archived: true })
    await tx((t) => updateLeaveType(t, null, { id: a.id, name: 'A2', color: '#B91C1C' }))
    const [row] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, a.id))
    expect(row).toMatchObject({ name: 'A2', color: '#B91C1C' })
    expect(await leaveTypeAudits()).toHaveLength(1)
    for (const run of [
      () => tx((t) => updateLeaveType(t, null, { id: a.id, name: 'เก่า' })),
      () => tx((t) => createLeaveType(t, null, { name: 'เก่า', color: '#0369A1' })),
    ]) {
      const e = await caught(run())
      expect(e.code).toBe('CONFLICT')
      expect(e.message).toBe(th.leaveTypes.errors.nameTaken)
      expect(e.extra.fieldErrors).toEqual({ name: [th.leaveTypes.errors.nameTaken] })
    }
  })

  it('delete unused → hard delete + snapshot; restore → same id and position', async () => {
    await makeLeaveType({ name: 'A' })
    const b = await makeLeaveType({ name: 'B' })
    await makeLeaveType({ name: 'C' })
    const res = await tx((t) => deleteLeaveType(t, null, b.id))
    expect(res).toEqual({
      outcome: 'deleted',
      deleted: { id: b.id, name: 'B', color: b.color, position: b.position, archivedAt: null },
    })
    expect(await names()).toEqual(['A', 'C'])
    if (res.outcome !== 'deleted') throw new Error('unreachable')
    await tx((t) => restoreLeaveType(t, null, res.deleted))
    expect(await names()).toEqual(['A', 'B', 'C'])
    const [row] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, b.id))
    expect(row?.position).toBe(b.position)
    expect((await leaveTypeAudits()).map((r) => r.action).sort()).toEqual(['delete', 'restore'])

    await tx((t) => deleteLeaveType(t, null, b.id))
    await makeLeaveType({ name: 'B' })
    const e = await caught(tx((t) => restoreLeaveType(t, null, res.deleted)))
    expect(e.code).toBe('CONFLICT')
    expect(e.message).toBe(th.leaveTypes.errors.restoreConflict)
  })

  it('delete a type used by any entry (even soft-deleted) → archived instead; usageCount counts live entries', async () => {
    const a = await makeLeaveType({ name: 'A' })
    await makeLeaveType({ name: 'B' })
    const u = await makeUser()
    await makeTimeOff({ user: u, leaveType: a, startDate: '2026-10-05' })
    await makeTimeOff({
      user: u,
      leaveType: a,
      startDate: '2026-10-06',
      deleted: { batch: '00000000-0000-4000-8000-000000000001', daysAgo: 1 },
    })
    expect((await listLeaveTypes(db, { includeArchived: true }))[0]?.usageCount).toBe(1)
    const res = await tx((t) => deleteLeaveType(t, null, a.id))
    expect(res).toEqual({ outcome: 'archived', id: a.id })
    const [row] = await db.select().from(leaveTypes).where(eq(leaveTypes.id, a.id))
    expect(row?.archivedAt).not.toBeNull()
    expect(await names(false)).toEqual(['B'])
    expect(await names(true)).toEqual(['A', 'B'])
    const [audit] = await leaveTypeAudits()
    expect(audit?.summary).toBe(th.audit.leaveTypeArchived('A'))

    const only = await makeLeaveType({ name: 'C' })
    await tx((t) => setLeaveTypeArchived(t, null, { id: only.id, archived: true }))
    await tx((t) => setLeaveTypeArchived(t, null, { id: a.id, archived: false }))
    expect(await names(false)).toEqual(['A', 'B'])
  })

  it('archiving or deleting the last active type → CONFLICT lastActive; unchanged archive state is a no-op', async () => {
    const a = await makeLeaveType({ name: 'A' })
    await makeLeaveType({ name: 'old', archived: true })
    for (const run of [
      () => tx((t) => setLeaveTypeArchived(t, null, { id: a.id, archived: true })),
      () => tx((t) => deleteLeaveType(t, null, a.id)),
    ]) {
      const e = await caught(run())
      expect(e.code).toBe('CONFLICT')
      expect(e.message).toBe(th.leaveTypes.errors.lastActive)
    }
    await tx((t) => setLeaveTypeArchived(t, null, { id: a.id, archived: false }))
    expect(await leaveTypeAudits()).toEqual([])
  })

  it('ensureDefaultLeaveTypes: empty → 4 rows named / coloured as th.leaveTypes.defaults in order; again → 0', async () => {
    expect(await tx((t) => ensureDefaultLeaveTypes(t, null))).toBe(4)
    const list = await listLeaveTypes(db, { includeArchived: true })
    expect(list.map((t) => ({ name: t.name, color: t.color }))).toEqual(
      th.leaveTypes.defaults.map((d) => ({ name: d.name, color: d.color })),
    )
    expect(await tx((t) => ensureDefaultLeaveTypes(t, null))).toBe(0)
    expect(await leaveTypeAudits()).toHaveLength(4)
  })
})

describe('leave types: GET /api/leave-types and actions', () => {
  it('route → only active types in order, exact DTO keys; nobody → 401', async () => {
    await makeLeaveType({ name: 'A', color: '#0369A1' })
    await makeLeaveType({ name: 'old', archived: true })
    await makeLeaveType({ name: 'B' })
    asUser(await makeUser())
    const res = await GET(new Request('http://t/api/leave-types'), { params: Promise.resolve({}) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as LeaveTypesResponse
    expect(body.leaveTypes.map((t) => t.name)).toEqual(['A', 'B'])
    for (const t of body.leaveTypes)
      expect(Object.keys(t).sort()).toEqual(['archived', 'color', 'id', 'name'])
    asNobody()
    const anon = await GET(new Request('http://t/api/leave-types'), { params: Promise.resolve({}) })
    expect(anon.status).toBe(401)
  })

  it('createLeaveType action: manager → { leaveType } + refresh(); worker → FORBIDDEN', async () => {
    asUser(await makeUser())
    expect(await createLeaveTypeAction({ name: 'ลาบวช', color: '#0f766e' })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    asUser(await makeUser({ role: 'manager' }))
    const ok = await createLeaveTypeAction({ name: 'ลาบวช', color: '#0f766e' })
    expect(ok).toMatchObject({ ok: true, leaveType: { name: 'ลาบวช', color: '#0F766E', archived: false } })
    expect(testCache.refresh).toHaveBeenCalled()
  })
})
