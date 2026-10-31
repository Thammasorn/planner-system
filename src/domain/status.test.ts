import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  completionTransition,
  DEFAULT_STATUSES,
  defaultStatus,
  firstDoneStatus,
  firstOfCategory,
  MAX_STATUSES,
  sortStatuses,
  STATUS_COLORS,
  validateStatusSet,
  type StatusLike,
} from './status'
import type { TaskStatusCategory } from './types'

const TODAY = '2026-09-30'
const NAMES: Record<string, string> = {
  todo: 'ยังไม่เริ่ม',
  doing: 'กำลังทำ',
  waitData: 'รอข้อมูล',
  blocked: 'ติดปัญหา',
  done: 'เสร็จ',
}
/** The 5 defaults as a project would hold them (positions a0…a4). */
const defaults: StatusLike[] = DEFAULT_STATUSES.map((d, i) => ({
  id: d.key,
  name: NAMES[d.key] ?? d.key,
  category: d.category,
  position: `a${i}`,
}))
const s = (id: string, category: TaskStatusCategory, position: string, name = id): StatusLike => ({
  id,
  name,
  category,
  position,
})

describe('BR-80 completionTransition', () => {
  it.each([
    ['TODO', 'DONE', null, TODAY, true],
    ['IN_PROGRESS', 'DONE', null, TODAY, true],
    ['WAITING', 'DONE', null, TODAY, true],
    ['DONE', 'DONE', '2026-09-28', '2026-09-28', false],
    ['DONE', 'TODO', '2026-09-28', null, true],
    ['DONE', 'WAITING', '2026-09-28', null, true],
    ['DONE', 'IN_PROGRESS', '2026-09-28', null, true],
    ['TODO', 'WAITING', null, null, false],
    ['IN_PROGRESS', 'TODO', null, null, false],
  ] as const)('%s → %s with completedOn %j → %j (changed %s)', (from, to, completedOn, expected, changed) => {
    expect(completionTransition({ from, to, completedOn, today: TODAY })).toEqual({
      completedOn: expected,
      changed,
    })
  })

  it('property (R22): completedOn !== null ⇔ to === DONE, given a consistent start', () => {
    const cat = fc.constantFrom<TaskStatusCategory>('TODO', 'IN_PROGRESS', 'WAITING', 'DONE')
    fc.assert(
      fc.property(cat, cat, fc.constantFrom('2026-01-05', '2026-09-28'), (from, to, earlier) => {
        const completedOn = from === 'DONE' ? earlier : null
        const r = completionTransition({ from, to, completedOn, today: TODAY })
        expect(r.completedOn !== null).toBe(to === 'DONE')
        expect(r.changed).toBe(r.completedOn !== completedOn)
        if (from === 'DONE' && to === 'DONE') expect(r.completedOn).toBe(earlier)
      }),
    )
  })
})

describe('sortStatuses (X48 byte order)', () => {
  it('orders by position with < / > (Zz before a0), then by id; the input is not mutated', () => {
    const input = [s('b', 'TODO', 'a0'), s('c', 'DONE', 'Zz'), s('a', 'TODO', 'a0')]
    expect(sortStatuses(input).map((x) => x.id)).toEqual(['c', 'a', 'b'])
    expect(input.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('BR-81 defaultStatus / BR-82 firstDoneStatus', () => {
  it('defaultStatus of the 5 defaults is ยังไม่เริ่ม', () => {
    expect(defaultStatus(defaults).name).toBe('ยังไม่เริ่ม')
  })

  it('defaultStatus picks the TODO with the smallest position in byte order (Zz before a0)', () => {
    const set = [s('t1', 'TODO', 'a0'), s('t2', 'TODO', 'Zz'), s('d', 'DONE', 'A0'), s('w', 'WAITING', 'A1')]
    expect(defaultStatus(set).id).toBe('t2')
  })

  it('defaultStatus breaks position ties by id', () => {
    expect(defaultStatus([s('t9', 'TODO', 'a0'), s('t1', 'TODO', 'a0'), s('d', 'DONE', 'a1')]).id).toBe('t1')
  })

  it('defaultStatus without a TODO is a RangeError', () => {
    expect(() => defaultStatus([s('d', 'DONE', 'a0')])).toThrow(RangeError)
  })

  it('firstDoneStatus of the 5 defaults is เสร็จ', () => {
    expect(firstDoneStatus(defaults).name).toBe('เสร็จ')
  })

  it('firstDoneStatus picks the DONE with the smallest position (byte order), ties by id', () => {
    const set = [s('d1', 'DONE', 'a0'), s('d3', 'DONE', 'Zz'), s('d2', 'DONE', 'Zz'), s('t', 'TODO', 'A0')]
    expect(firstDoneStatus(set).id).toBe('d2')
  })

  it('firstDoneStatus without a DONE is a RangeError', () => {
    expect(() => firstDoneStatus([s('t', 'TODO', 'a0')])).toThrow(RangeError)
  })
})

describe('firstOfCategory (FR-666)', () => {
  it('WAITING in the defaults → รอข้อมูล (waitData precedes blocked)', () => {
    expect(firstOfCategory(defaults, 'WAITING')?.name).toBe('รอข้อมูล')
  })

  it('a category absent from the set → null', () => {
    expect(firstOfCategory([s('t', 'TODO', 'a0'), s('d', 'DONE', 'a1')], 'IN_PROGRESS')).toBeNull()
  })
})

describe('BR-84 / M3-D26 validateStatusSet', () => {
  const only = (cats: readonly TaskStatusCategory[]) =>
    cats.map((category, i) => ({ name: `s${i}`, category }))

  it('the 5 defaults → null', () => {
    expect(validateStatusSet(defaults)).toBeNull()
  })

  it('exactly MAX_STATUSES (12) valid entries → null', () => {
    expect(
      validateStatusSet(only(['TODO', ...Array<TaskStatusCategory>(10).fill('WAITING'), 'DONE'])),
    ).toBeNull()
  })

  it('without the TODO → NO_TODO', () => {
    expect(validateStatusSet(defaults.filter((x) => x.category !== 'TODO'))).toBe('NO_TODO')
  })

  it('without the DONE → NO_DONE', () => {
    expect(validateStatusSet(defaults.filter((x) => x.category !== 'DONE'))).toBe('NO_DONE')
  })

  it('an empty set → NO_TODO (TODO is checked before DONE)', () => {
    expect(validateStatusSet([])).toBe('NO_TODO')
  })

  it('13 entries → TOO_MANY', () => {
    expect(validateStatusSet(only(['TODO', ...Array<TaskStatusCategory>(11).fill('WAITING'), 'DONE']))).toBe(
      'TOO_MANY',
    )
  })

  it("'Done' + ' done ' → DUPLICATE_NAME (trim + lower case)", () => {
    expect(
      validateStatusSet([
        { name: 'Todo', category: 'TODO' },
        { name: 'Done', category: 'DONE' },
        { name: ' done ', category: 'WAITING' },
      ]),
    ).toBe('DUPLICATE_NAME')
  })

  it('a duplicate name is reported before NO_TODO', () => {
    expect(
      validateStatusSet([
        { name: 'x', category: 'DONE' },
        { name: 'X', category: 'DONE' },
      ]),
    ).toBe('DUPLICATE_NAME')
  })

  it('13 entries that also lack a TODO → TOO_MANY (order)', () => {
    expect(validateStatusSet(only([...Array<TaskStatusCategory>(12).fill('WAITING'), 'DONE']))).toBe(
      'TOO_MANY',
    )
  })
})

describe('FR-621 / M3-D25 constants', () => {
  it('DEFAULT_STATUSES keys are unique', () => {
    expect(new Set(DEFAULT_STATUSES.map((d) => d.key)).size).toBe(DEFAULT_STATUSES.length)
  })

  it('every default colour is in STATUS_COLORS', () => {
    for (const d of DEFAULT_STATUSES) expect(STATUS_COLORS).toContain(d.color)
  })

  it('exactly one TODO and one DONE default; the set is valid and ≤ MAX_STATUSES', () => {
    expect(DEFAULT_STATUSES.filter((d) => d.category === 'TODO')).toHaveLength(1)
    expect(DEFAULT_STATUSES.filter((d) => d.category === 'DONE')).toHaveLength(1)
    expect(DEFAULT_STATUSES.length).toBeLessThanOrEqual(MAX_STATUSES)
  })

  it('STATUS_COLORS has 8 distinct #RRGGBB colours, slate first (SPEC DDL default)', () => {
    expect(STATUS_COLORS).toHaveLength(8)
    expect(new Set(STATUS_COLORS).size).toBe(8)
    expect(STATUS_COLORS[0]).toBe('#94A3B8')
    for (const c of STATUS_COLORS) expect(c).toMatch(/^#[0-9A-F]{6}$/)
  })
})
