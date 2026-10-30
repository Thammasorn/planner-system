import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { auditLog, positions } from '@/server/db/schema'
import { createPosition, listPositions, movePosition } from './positions'

const names = async () => (await listPositions(db)).map((p) => p.name)

describe('positions service mechanics (X48)', () => {
  it('T-POSS-01 create A, B, C then move C up twice → C, A, B; moving the first up is a no-op without audit', async () => {
    const ids: Record<string, string> = {}
    for (const name of ['A', 'B', 'C']) {
      ids[name] = (await db.transaction((tx) => createPosition(tx, null, { name }))).id
    }
    expect(await names()).toEqual(['A', 'B', 'C'])
    await db.transaction((tx) => movePosition(tx, null, { id: ids.C!, direction: 'up' }))
    expect(await names()).toEqual(['A', 'C', 'B'])
    await db.transaction((tx) => movePosition(tx, null, { id: ids.C!, direction: 'up' }))
    expect(await names()).toEqual(['C', 'A', 'B'])

    const auditBefore = (await db.select().from(auditLog)).length
    await db.transaction((tx) => movePosition(tx, null, { id: ids.C!, direction: 'up' }))
    await db.transaction((tx) => movePosition(tx, null, { id: ids.B!, direction: 'down' }))
    expect(await names()).toEqual(['C', 'A', 'B'])
    expect((await db.select().from(auditLog)).length).toBe(auditBefore)

    await db.transaction((tx) => movePosition(tx, null, { id: ids.C!, direction: 'down' }))
    expect(await names()).toEqual(['A', 'C', 'B'])
  })

  it('T-POSS-02 equal neighbour keys (inserted directly) → move re-keys and succeeds', async () => {
    const [a] = await db.insert(positions).values({ name: 'A', position: 'a0' }).returning()
    await db.insert(positions).values([
      { name: 'B', position: 'a1' },
      { name: 'C', position: 'a1' },
    ])
    const before = await names() // B/C tie → ordered by id
    await db.transaction((tx) => movePosition(tx, null, { id: a!.id, direction: 'down' }))
    const after = await names()
    expect(after).toEqual([before[1], 'A', before[2]])
    const keys = (await listPositions(db)).map((p) => p.position)
    expect(new Set(keys).size).toBe(3)
    expect([...keys].sort()).toEqual(keys)
  })
})
