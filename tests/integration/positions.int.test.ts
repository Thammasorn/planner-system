// FR-208, X48, M1-D14 — position CRUD, ordering, delete guard and restore (undo).
// plan/m01-auth-employees.md §5.S4 (S4.8).
import { asc, eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import {
  createPosition,
  deletePosition,
  movePosition,
  renamePosition,
  restorePosition,
} from '@/server/actions/positions'
import { db } from '@/server/db/client'
import { positions } from '@/server/db/schema'
import { asUser } from '../helpers/as-user'
import { makePosition, makeUser } from '../helpers/factories'

async function names(): Promise<string[]> {
  const rows = await db
    .select({ name: positions.name })
    .from(positions)
    .orderBy(asc(positions.position), asc(positions.id))
  return rows.map((r) => r.name)
}

async function create(name: string): Promise<string> {
  const res = await createPosition({ name })
  if (!res.ok) throw new Error(`createPosition(${name}) → ${res.code}`)
  return res.id
}

beforeEach(async () => {
  asUser(await makeUser({ role: 'manager' }))
})

describe('positions (FR-208)', () => {
  it('T-POS-01 create appends at the end', async () => {
    await makePosition('Developer')
    await create('Designer')
    await create('DevOps')
    expect(await names()).toEqual(['Developer', 'Designer', 'DevOps'])
  })

  it('T-POS-02 a duplicate name → CONFLICT on name', async () => {
    await create('QA')
    const res = await createPosition({ name: 'QA' })
    expect(res).toMatchObject({ ok: false, code: 'CONFLICT' })
    if (res.ok) return
    expect(res.fieldErrors?.name).toEqual([th.positions.nameTaken])
    expect(await names()).toEqual(['QA'])
  })

  it('T-POS-03 rename', async () => {
    const id = await create('DevOps')
    expect(await renamePosition({ id, name: 'Platform' })).toEqual({ ok: true })
    expect(await names()).toEqual(['Platform'])
  })

  it('T-POS-04 move up / down changes ORDER BY position, id', async () => {
    await create('A')
    const b = await create('B')
    const c = await create('C')
    expect((await movePosition({ id: c, direction: 'up' })).ok).toBe(true)
    expect(await names()).toEqual(['A', 'C', 'B'])
    expect((await movePosition({ id: c, direction: 'up' })).ok).toBe(true)
    expect(await names()).toEqual(['C', 'A', 'B'])
    expect((await movePosition({ id: c, direction: 'down' })).ok).toBe(true)
    expect(await names()).toEqual(['A', 'C', 'B'])
    expect((await movePosition({ id: b, direction: 'down' })).ok).toBe(true) // already last: no-op
    expect(await names()).toEqual(['A', 'C', 'B'])
  })

  it('T-POS-05 deleting an unused position removes it and returns { id, name, position }', async () => {
    const p = await makePosition('Unused')
    const res = await deletePosition({ id: p.id })
    expect(res).toEqual({ ok: true, deleted: { id: p.id, name: 'Unused', position: p.position } })
    expect(await db.select().from(positions).where(eq(positions.id, p.id))).toEqual([])
  })

  it('T-POS-06 a position used by an active and a deactivated user cannot be deleted (IN_USE, count 2)', async () => {
    await makeUser({ positionName: 'QA' })
    const gone = await makeUser({ positionName: 'QA', deactivated: { on: '2026-09-01' } })
    const res = await deletePosition({ id: gone.positionId! })
    expect(res).toMatchObject({ ok: false, code: 'IN_USE', message: th.positions.inUse(2) })
    expect(await names()).toEqual(['QA'])
  })

  it('T-POS-07 restore brings back the same id, name and key; a name taken meanwhile → CONFLICT', async () => {
    await create('A')
    const b = await create('B')
    await create('C')
    const del = await deletePosition({ id: b })
    expect(del.ok).toBe(true)
    if (!del.ok) return
    expect(await names()).toEqual(['A', 'C'])
    expect(await restorePosition(del.deleted)).toEqual({ ok: true })
    expect(await names()).toEqual(['A', 'B', 'C'])
    const [row] = await db.select().from(positions).where(eq(positions.id, b))
    expect(row).toMatchObject(del.deleted)

    const again = await deletePosition({ id: b })
    if (!again.ok) throw new Error(again.code)
    await create('B')
    const conflict = await restorePosition(again.deleted)
    expect(conflict).toMatchObject({ ok: false, code: 'CONFLICT', message: th.positions.restoreConflict })
  })

  it('T-POS-08 positions.position uses collation C (X48)', async () => {
    const rows = await db.execute<{ collation_name: string | null }>(
      sql`select collation_name from information_schema.columns where table_name = 'positions' and column_name = 'position'`,
    )
    expect(rows[0]?.collation_name).toBe('C')
  })
})
