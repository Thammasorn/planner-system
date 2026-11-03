import { describe, expect, it } from 'vitest'
import type { PersonOption } from '@/lib/contracts/people'
import { filterPeople } from './filter'
import { sortPeople } from './sort'

const p = (id: string, name: string, nickname: string | null, positionName: string | null): PersonOption => ({
  id,
  name,
  nickname,
  positionId: null,
  positionName,
  color: null,
  active: true,
})

const cindy = p('cindy', 'Cindy Chaiyaporn', 'Cindy', 'Project Manager')
const ivy = p('ivy', 'Ivy Icarus', 'Ivy', 'QA')
const peter = p('peter', 'Peter S.', null, 'Data')
const somchai = p('somchai', 'สมชาย ใจดี', 'ชาย', null)
const options = [cindy, ivy, peter, somchai]

describe('filterPeople', () => {
  it('matches the position case-insensitively', () => {
    expect(filterPeople(options, 'qa')).toEqual([ivy])
  })

  it('matches a Thai substring of the full name', () => {
    expect(filterPeople(options, 'ใจ')).toEqual([somchai])
  })

  it('matches the nickname', () => {
    expect(filterPeople(options, 'ชาย')).toEqual([somchai])
  })

  it('returns every option (input order) for a blank query', () => {
    expect(filterPeople(options, ' ')).toEqual(options)
    expect(filterPeople(options, '')).toEqual(options)
  })

  it('is case-insensitive on names', () => {
    expect(filterPeople(options, 'PETE')).toEqual([peter])
  })

  it('normalises to NFC on both sides', () => {
    // "é" decomposed (e + U+0301) in the query, composed in the option
    const rene = p('rene', 'René', null, null)
    expect(filterPeople([rene], 'rené')).toEqual([rene])
  })

  it('keeps the input order of matches', () => {
    expect(filterPeople([peter, cindy, ivy], 'a').map((o) => o.id)).toEqual(['peter', 'cindy', 'ivy'])
  })
})

describe('sortPeople', () => {
  it('sorts by display name with the Thai collator (Thai script first) and does not mutate', () => {
    const input = [peter, somchai, ivy, cindy]
    expect(sortPeople(input).map((o) => o.id)).toEqual(['somchai', 'cindy', 'ivy', 'peter'])
    expect(input[0]).toBe(peter)
  })
})
