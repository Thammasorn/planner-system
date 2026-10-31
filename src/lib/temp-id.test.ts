import { describe, expect, it } from 'vitest'
import { isTempId, tempId } from './temp-id'

describe('tempId (X53)', () => {
  it('1 000 calls → 1 000 distinct temp ids', () => {
    const ids = Array.from({ length: 1000 }, () => tempId())
    expect(new Set(ids).size).toBe(1000)
    for (const id of ids) {
      expect(isTempId(id)).toBe(true)
      expect(id).toMatch(/^tmp_\d+_[0-9a-f]{12}$/)
    }
  })

  it('real uuids are not temp ids', () => {
    expect(isTempId('6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f')).toBe(false)
  })
})
