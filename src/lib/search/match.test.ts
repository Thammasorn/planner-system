// M10 S0.3 (M10-D21): local matching for the palette's projects / people / clients index.
import { describe, expect, it } from 'vitest'
import { matchLocal } from './match'

const item = (id: string, ...keys: string[]) => ({ id, keys })
const projects = [
  item('pos', 'POS Upgrade'),
  item('dw', 'Data Warehouse'),
  item('sad', 'Store Analytics Dashboard'),
  item('mob', 'Mobile App Revamp'),
]
const names = (q: string, list = projects, limit?: number) => matchLocal(list, q, limit).map((x) => x.keys[0])

describe('matchLocal', () => {
  it('prefix first', () => {
    expect(names('po')).toEqual(['POS Upgrade'])
    expect(names('dash')).toEqual(['Store Analytics Dashboard'])
  })

  it('word start beats other substrings, then earliest index', () => {
    expect(names('re')).toEqual(['Mobile App Revamp', 'Store Analytics Dashboard', 'Data Warehouse'])
    expect(names('a')).toEqual([
      'Store Analytics Dashboard',
      'Mobile App Revamp',
      'Data Warehouse',
      'POS Upgrade',
    ])
  })

  it('matches any key, folded', () => {
    const people = [item('p1', 'Peter', 'Peter', 'Data'), item('p2', 'Cindy', 'Cindy', 'PM')]
    expect(names('pet', people)).toEqual(['Peter'])
    expect(names('DATA', people)).toEqual(['Peter'])
  })

  it('Thai substring', () => {
    expect(names('ลูก', [item('c1', 'ลูกค้า Coral'), item('c2', 'Central')])).toEqual(['ลูกค้า Coral'])
  })

  it('limits to 8 by default, honours a limit', () => {
    const many = Array.from({ length: 9 }, (_, i) => item(`x${i}`, `Proj ${i}`))
    expect(matchLocal(many, 'proj')).toHaveLength(8)
    expect(matchLocal(many, 'proj', 3)).toHaveLength(3)
  })

  it('ties break by Thai collation of keys[0], then id', () => {
    const list = [item('b', 'ข'), item('a', 'ก'), item('c', 'ก')]
    expect(matchLocal(list, 'ก').map((x) => x.id)).toEqual(['a', 'c'])
    expect(matchLocal([item('z', 'xa'), item('y', 'xb')], 'x').map((x) => x.id)).toEqual(['z', 'y'])
  })

  it('empty or whitespace query → []', () => {
    expect(matchLocal(projects, '')).toEqual([])
    expect(matchLocal(projects, '  ​ ')).toEqual([])
  })
})
