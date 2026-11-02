// M9 S0.11 helpers: allNumbersInteger / containsAny (pure) and deactivateUser (DB).
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { session, user } from '@/server/db/schema'
import { deactivateUser, makeUser } from './factories'
import { allNumbersInteger, containsAny } from './json'

describe('json helpers (BR-03, §3.3)', () => {
  it('allNumbersInteger walks nested arrays and objects', () => {
    expect(allNumbersInteger({ a: 1, b: [2, { c: 300 }], d: 'x', e: null, f: true })).toBe(true)
    expect(allNumbersInteger({ a: [{ b: 1.5 }] })).toBe(false)
    expect(allNumbersInteger(2.25)).toBe(false)
    expect(allNumbersInteger([])).toBe(true)
  })

  it('containsAny returns the needles found in the serialized body', () => {
    const body = { rows: [{ name: 'POS Upgrade', id: 'abc-123' }] }
    expect(containsAny(body, ['POS Upgrade', 'Data Warehouse', 'abc-123', ''])).toEqual([
      'POS Upgrade',
      'abc-123',
    ])
    expect(containsAny(undefined, ['x'])).toEqual([])
  })
})

describe('deactivateUser (X64)', () => {
  it('sets banned / ban_reason / deactivated_on and removes the sessions', async () => {
    const u = await makeUser()
    await deactivateUser(u, '2026-10-19')
    const [row] = await db.select().from(user).where(eq(user.id, u.id))
    expect(row).toMatchObject({ banned: true, banReason: 'DEACTIVATED', deactivatedOn: '2026-10-19' })
    expect(await db.select().from(session).where(eq(session.userId, u.id))).toEqual([])
  })
})
