import { describe, expect, it } from 'vitest'
import { compareThai, sortByThai } from './collate'

describe('collate (M2-D18)', () => {
  it('sorts the golden project names', () => {
    const names = [
      'Store Analytics Dashboard',
      'CRM Migration',
      'POS Upgrade',
      'Data Warehouse',
      'Mobile App Revamp',
    ]
    expect(sortByThai(names, (s) => s)).toEqual([
      'CRM Migration',
      'Data Warehouse',
      'Mobile App Revamp',
      'POS Upgrade',
      'Store Analytics Dashboard',
    ])
  })

  it('sorts Thai consonants and is case-insensitive', () => {
    expect(sortByThai(['ข', 'ก', 'ค'], (s) => s)).toEqual(['ก', 'ข', 'ค'])
    expect(sortByThai(['b', 'A'], (s) => s)).toEqual(['A', 'b'])
  })

  it('does not mutate the input and compareThai is a comparator', () => {
    const input = ['b', 'a'] as const
    expect(sortByThai(input, (s) => s)).toEqual(['a', 'b'])
    expect(input).toEqual(['b', 'a'])
    expect(compareThai('a', 'a')).toBe(0)
    expect(compareThai('a', 'b')).toBeLessThan(0)
  })
})
