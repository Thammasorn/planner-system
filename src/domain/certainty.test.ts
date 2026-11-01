import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  addLoad,
  certaintySource,
  effectiveCertainty,
  resolveCertainty,
  splitLoad,
  viewLoad,
  ZERO_LOAD,
  type CertaintyNode,
} from './certainty'
import type { Certainty, LoadPair, LoadView } from './types'

type O = Certainty | null
const IDS = ['t', 'p', 'g'] as const
const NAMES = ['งาน', 'งานแม่', 'งานแม่ของแม่'] as const

/** overrides listed task → parent → grandparent (nearest first). */
const chainOf = (overrides: readonly O[]): CertaintyNode[] =>
  overrides.map((certaintyOverride, i) => ({
    id: IDS[i] ?? `n${i}`,
    name: NAMES[i] ?? `n${i}`,
    certaintyOverride,
  }))

describe('BR-35/36 resolveCertainty', () => {
  it.each([
    [[null], 'CONFIRMED', 'CONFIRMED', 'project', null],
    [[null], 'TENTATIVE', 'TENTATIVE', 'project', null],
    [['TENTATIVE'], 'CONFIRMED', 'TENTATIVE', 'task', 't'],
    [['CONFIRMED'], 'TENTATIVE', 'CONFIRMED', 'task', 't'],
    [[null, 'TENTATIVE'], 'CONFIRMED', 'TENTATIVE', 'ancestor', 'p'],
    [[null, null, 'TENTATIVE'], 'CONFIRMED', 'TENTATIVE', 'ancestor', 'g'],
    [[null, 'CONFIRMED', 'TENTATIVE'], 'TENTATIVE', 'CONFIRMED', 'ancestor', 'p'], // nearest wins
    [['CONFIRMED', 'TENTATIVE', null], 'TENTATIVE', 'CONFIRMED', 'task', 't'],
    [[null, null, null], 'TENTATIVE', 'TENTATIVE', 'project', null],
  ] as const)(
    'overrides %j in a %s project → %s from %s (%s)',
    (overrides, project, value, source, sourceTaskId) => {
      const chain = chainOf(overrides)
      const r = resolveCertainty(chain, project)
      expect(r).toEqual({
        value,
        source,
        sourceTaskId,
        sourceTaskName: sourceTaskId === null ? null : chain.find((n) => n.id === sourceTaskId)?.name,
      })
      expect(effectiveCertainty(chain, project)).toBe(value)
      expect(certaintySource(chain, project)).toBe(source)
    },
  )

  it('golden "Rollout สาขา" (override TENTATIVE) in POS (CONFIRMED) → TENTATIVE, set on the task', () => {
    const r = resolveCertainty(
      [{ id: 'rollout', name: 'Rollout สาขา', certaintyOverride: 'TENTATIVE' }],
      'CONFIRMED',
    )
    expect(r).toEqual({
      value: 'TENTATIVE',
      source: 'task',
      sourceTaskId: 'rollout',
      sourceTaskName: 'Rollout สาขา',
    })
  })

  it('golden "ย้ายข้อมูลลูกค้า" (no override) in CRM (TENTATIVE) → TENTATIVE from the project', () => {
    const r = resolveCertainty(
      [{ id: 'crm1', name: 'ย้ายข้อมูลลูกค้า', certaintyOverride: null }],
      'TENTATIVE',
    )
    expect(r).toEqual({ value: 'TENTATIVE', source: 'project', sourceTaskId: null, sourceTaskName: null })
  })

  it('BR-36 sourceTaskName is the name of the inheriting ancestor', () => {
    expect(resolveCertainty(chainOf([null, 'TENTATIVE']), 'CONFIRMED').sourceTaskName).toBe('งานแม่')
  })

  it('BR-30 an empty chain is a RangeError', () => {
    expect(() => resolveCertainty([], 'CONFIRMED')).toThrow(RangeError)
    expect(() => effectiveCertainty([], 'CONFIRMED')).toThrow(RangeError)
    expect(() => certaintySource([], 'CONFIRMED')).toThrow(RangeError)
  })

  it('BR-30 a 4-node chain is a RangeError', () => {
    expect(() => resolveCertainty(chainOf([null, null, null, 'TENTATIVE']), 'CONFIRMED')).toThrow(RangeError)
  })

  it('property: value = first non-null override ?? project; source "task" iff the task has its own override', () => {
    const arbO = fc.constantFrom<O>('CONFIRMED', 'TENTATIVE', null)
    fc.assert(
      fc.property(
        fc.array(arbO, { minLength: 1, maxLength: 3 }),
        fc.constantFrom<Certainty>('CONFIRMED', 'TENTATIVE'),
        (overrides, project) => {
          const chain = chainOf(overrides)
          const r = resolveCertainty(chain, project)
          const firstNonNull = overrides.find((o) => o !== null) ?? null
          expect(r.value).toBe(firstNonNull ?? project)
          expect(r.source === 'task').toBe(overrides[0] !== null)
          expect(r.source === 'project').toBe(firstNonNull === null)
          expect(r.sourceTaskId === null).toBe(r.source === 'project')
        },
      ),
    )
  })
})

describe('load (BR-37, X03)', () => {
  it.each([
    [250, 'TENTATIVE', { total: 250, committed: 0 }],
    [250, 'CONFIRMED', { total: 250, committed: 250 }],
    [0, 'CONFIRMED', { total: 0, committed: 0 }],
  ] as const)('splitLoad(%i, %s) = %j', (cd, certainty, expected) => {
    expect(splitLoad(cd, certainty)).toEqual(expected)
  })

  it.each([
    ['ALL', 625],
    ['COMMITTED', 500],
    ['AT_RISK', 125],
  ] as const)('viewLoad({625, 500}, %s) = %i', (view, expected) => {
    expect(viewLoad({ total: 625, committed: 500 }, view)).toBe(expected)
  })

  it('addLoad adds both parts; ZERO_LOAD is the identity and frozen', () => {
    expect(addLoad({ total: 250, committed: 0 }, { total: 375, committed: 375 })).toEqual({ total: 625, committed: 375 })
    expect(addLoad(ZERO_LOAD, { total: 5, committed: 1 })).toEqual({ total: 5, committed: 1 })
    expect(ZERO_LOAD).toEqual({ total: 0, committed: 0 })
    expect(Object.isFrozen(ZERO_LOAD)).toBe(true)
  })

  it('splitLoad rejects non-integer cd (BR-01)', () => {
    expect(() => splitLoad(1.5, 'CONFIRMED')).toThrow(RangeError)
  })

  const arbPair: fc.Arbitrary<LoadPair> = fc
    .tuple(fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 0, max: 100_000 }))
    .map(([a, b]) => ({ total: Math.max(a, b), committed: Math.min(a, b) }))

  it('property: addLoad is associative and commutative; ZERO_LOAD is neutral', () => {
    fc.assert(
      fc.property(arbPair, arbPair, arbPair, (a, b, c) => {
        expect(addLoad(addLoad(a, b), c)).toEqual(addLoad(a, addLoad(b, c)))
        expect(addLoad(a, b)).toEqual(addLoad(b, a))
        expect(addLoad(a, ZERO_LOAD)).toEqual(a)
      }),
    )
  })

  it('property: ALL = COMMITTED + AT_RISK and the views are additive', () => {
    const views: LoadView[] = ['ALL', 'COMMITTED', 'AT_RISK']
    fc.assert(
      fc.property(arbPair, arbPair, (a, b) => {
        expect(viewLoad(a, 'ALL')).toBe(viewLoad(a, 'COMMITTED') + viewLoad(a, 'AT_RISK'))
        for (const v of views) expect(viewLoad(addLoad(a, b), v)).toBe(viewLoad(a, v) + viewLoad(b, v))
      }),
    )
  })
})
