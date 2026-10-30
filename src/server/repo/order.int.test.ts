import { asc } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { positions } from '@/server/db/schema'
import { keyAfter, keyBetween, lockOrderScope, rekey } from './order'

describe('order keys (X48)', () => {
  it('T-ORD-01 three appends then "before first" → ORDER BY position, id matches the JS < order (COLLATE "C")', async () => {
    const keys: string[] = []
    await db.transaction(async (tx) => {
      await lockOrderScope(tx, 'positions')
      let last: string | null = null
      for (const name of ['A', 'B', 'C']) {
        last = keyAfter(last)
        keys.push(last)
        await tx.insert(positions).values({ name, position: last })
      }
      const first = keyBetween(null, keys[0]!)
      expect(first.startsWith('Z')).toBe(true) // 'Zz' sorts before 'a0' only under byte order
      keys.unshift(first)
      await tx.insert(positions).values({ name: 'Before', position: first })
    })
    const rows = await db
      .select({ name: positions.name, position: positions.position })
      .from(positions)
      .orderBy(asc(positions.position), asc(positions.id))
    const jsOrder = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    expect(rows.map((r) => r.position)).toEqual(jsOrder)
    expect(rows.map((r) => r.name)).toEqual(['Before', 'A', 'B', 'C'])
  })

  it('rekey(n) yields n strictly increasing keys', () => {
    const ks = rekey(5)
    expect(ks).toHaveLength(5)
    for (let i = 1; i < ks.length; i++) expect(ks[i - 1]! < ks[i]!).toBe(true)
    expect(keyBetween(ks[0]!, ks[1]!) > ks[0]!).toBe(true)
  })
})
