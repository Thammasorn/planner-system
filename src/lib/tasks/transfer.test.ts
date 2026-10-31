import { describe, expect, it } from 'vitest'
import { reverseTransfer } from './transfer'

describe('M3-D3 reverseTransfer', () => {
  const t = { assignmentIds: ['as1', 'as2'], fromTaskId: 'parent', toTaskId: 'child' }

  it('swaps from and to, keeping the assignment ids', () => {
    expect(reverseTransfer(t)).toEqual({
      assignmentIds: ['as1', 'as2'],
      fromTaskId: 'child',
      toTaskId: 'parent',
    })
  })

  it('is an involution', () => {
    expect(reverseTransfer(reverseTransfer(t))).toEqual(t)
  })
})
