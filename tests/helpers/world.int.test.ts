import { describe, expect, it } from 'vitest'
import { createWorld, expandParts } from './world'

describe('world fixture (X91)', () => {
  it('expandParts([]) is empty; createWorld() gives 4 users with the roles of PLAN §4.3', async () => {
    expect(expandParts([]).size).toBe(0)
    expect([...expandParts(['tasks', 'tasks'])]).toEqual(['tasks'])
    const w = await createWorld()
    expect(w.manager.role).toBe('manager')
    expect([w.lead.role, w.member.role, w.outsider.role]).toEqual(['worker', 'worker', 'worker'])
    expect(new Set([w.manager.id, w.lead.id, w.member.id, w.outsider.id]).size).toBe(4)
    expect(w.manager.sessionToken).not.toBe('')
    expect(w.users).toEqual({})
  })

  it('parts without a builder throw', async () => {
    await expect(createWorld({ with: ['tasks'] })).rejects.toThrow('world part tasks has no builder yet')
  })
})
