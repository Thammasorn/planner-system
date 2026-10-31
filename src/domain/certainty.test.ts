import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { certaintySource, effectiveCertainty, resolveCertainty, type CertaintyNode } from './certainty'
import type { Certainty } from './types'

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
