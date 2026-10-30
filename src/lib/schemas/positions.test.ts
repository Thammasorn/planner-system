import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { createPositionInput, movePositionInput, POSITION_KEY, restorePositionInput } from './positions'

describe('position schemas (FR-208)', () => {
  it('trims names and validates keys', () => {
    expect(createPositionInput.parse({ name: '  QA ' }).name).toBe('QA')
    expect(createPositionInput.safeParse({ name: ' ' }).error?.issues[0]?.message).toBe(
      th.positions.nameRequired,
    )
    expect(
      movePositionInput.safeParse({ id: '0b6c1b5e-6a51-4c4b-9e1a-2f0a8d7c3b21', direction: 'left' }).success,
    ).toBe(false)
    expect(POSITION_KEY.test('a0')).toBe(true)
    expect(POSITION_KEY.test('Zz')).toBe(true)
    expect(POSITION_KEY.test('0a')).toBe(false)
    expect(
      restorePositionInput.safeParse({
        id: '0b6c1b5e-6a51-4c4b-9e1a-2f0a8d7c3b21',
        name: 'QA',
        position: 'a0; drop',
      }).success,
    ).toBe(false)
  })
})
