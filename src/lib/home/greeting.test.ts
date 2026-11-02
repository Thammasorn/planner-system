import { describe, expect, it } from 'vitest'
import { greetingKey } from './greeting'

describe('greetingKey (M10-D19)', () => {
  it.each([
    [0, 'evening'],
    [4, 'evening'],
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [23, 'evening'],
  ] as const)('%i → %s', (h, k) => {
    expect(greetingKey(h)).toBe(k)
  })
})
