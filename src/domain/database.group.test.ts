// BR-96 kanban grouping and drops (plan/m11 S1.9, AC-1404).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DbDomainError, dropOnGroup, groupKeyId, groupRows, type GroupKey } from './database'
import type { DbRowModel, ViewConfig } from './types'
import {
  CINDY,
  IVY,
  MINT,
  OLD,
  OPT_DOING,
  OPT_DONE,
  OPT_TODO,
  ctx,
  col,
  row,
} from './database/fixtures.test.helper'

const title = col('TITLE')
const sel = col('SELECT')
const person = col('PERSON')
const check = col('CHECKBOX')
const multi = col('MULTI_SELECT')
const num = col('NUMBER')
const cols = [title, sel, person, check, multi, num]

const view = (config: ViewConfig) => ({ config })
const summary = (r: ReturnType<typeof groupRows>) =>
  r.ok ? r.groups.map((g) => [groupKeyId(g.key), g.rows.map((x) => x.id)]) : r.reason

describe('groupRows (BR-96)', () => {
  it('needs a SELECT / PERSON / CHECKBOX column', () => {
    expect(groupRows([], view({}), cols, ctx)).toEqual({ ok: false, reason: 'NO_GROUP_COLUMN' })
    expect(groupRows([], view({ groupByColumnId: 'gone' }), cols, ctx)).toEqual({
      ok: false,
      reason: 'NO_GROUP_COLUMN',
    })
    expect(groupRows([], view({ groupByColumnId: multi.id }), cols, ctx)).toEqual({
      ok: false,
      reason: 'NO_GROUP_COLUMN',
    })
  })
  it('SELECT: option order incl. empty options, then "none"; deleted options fall into none', () => {
    const rows = [
      row('a', { [sel.id]: OPT_DONE.id }),
      row('b'),
      row('c', { [sel.id]: 'o-gone' }),
      row('d', { [sel.id]: OPT_DONE.id }, { position: 'Z' }),
    ]
    const out = groupRows(rows, view({ groupByColumnId: sel.id }), cols, ctx)
    expect(summary(out)).toEqual([
      ['option:o-todo', []],
      ['option:o-doing', []],
      ['option:o-done', ['d', 'a']],
      ['none', ['b', 'c']],
    ])
    if (out.ok) {
      expect(out.groups[2]).toMatchObject({ label: OPT_DONE.name, color: 'green' })
      expect(out.groups[3]).toMatchObject({ label: null, color: null })
    }
  })
  it('hideEmptyGroups drops groups without cards', () => {
    const out = groupRows(
      [row('a', { [sel.id]: OPT_DOING.id })],
      view({ groupByColumnId: sel.id, hideEmptyGroups: true }),
      cols,
      ctx,
    )
    expect(summary(out)).toEqual([['option:o-doing', ['a']]])
  })
  it('PERSON: people in ≥ 1 row by collator, multi-person rows in every group, then none (AC-1404)', () => {
    const rows = [
      row('cindy-ivy', { [person.id]: [CINDY, IVY] }),
      row('mint', { [person.id]: [MINT] }),
      row('nobody'),
      row('old', { [person.id]: [OLD] }),
    ]
    const out = groupRows(rows, view({ groupByColumnId: person.id }), cols, ctx)
    // collator: กมล (OLD) < ซินดี้ (CINDY) < มินท์ (MINT) < ไอวี่ (IVY)
    expect(summary(out)).toEqual([
      ['person:u-old', ['old']],
      ['person:u-cindy', ['cindy-ivy']],
      ['person:u-mix', ['mint']],
      ['person:u-ivy', ['cindy-ivy']],
      ['none', ['nobody']],
    ])
    if (out.ok) expect(out.groups[1]).toMatchObject({ label: 'ซินดี้ ชัยวัฒน์', color: null })
  })
  it('PERSON: equal names fall back to the id order', () => {
    const twins = new Map([
      ['u-b', { name: 'Same', nickname: null, color: null, deactivated: false }],
      ['u-a', { name: 'same', nickname: null, color: null, deactivated: false }],
    ])
    const rows = [row('x', { [person.id]: ['u-b', 'u-a'] })]
    const out = groupRows(rows, view({ groupByColumnId: person.id }), cols, { ...ctx, people: twins })
    expect(summary(out)).toEqual([
      ['person:u-a', ['x']],
      ['person:u-b', ['x']],
      ['none', []],
    ])
  })
  it('PERSON: unknown ids get the id as label', () => {
    const out = groupRows(
      [row('x', { [person.id]: ['u-zz'] })],
      view({ groupByColumnId: person.id }),
      cols,
      ctx,
    )
    expect(out.ok && out.groups[0]!.label).toBe('u-zz')
  })
  it('CHECKBOX: checked, unchecked, no "none" group', () => {
    const rows = [row('a', { [check.id]: true }), row('b')]
    expect(summary(groupRows(rows, view({ groupByColumnId: check.id }), cols, ctx))).toEqual([
      ['checked', ['a']],
      ['unchecked', ['b']],
    ])
    expect(
      summary(groupRows([row('b')], view({ groupByColumnId: check.id, hideEmptyGroups: true }), cols, ctx)),
    ).toEqual([['unchecked', ['b']]])
  })
  it('in-group order follows the view sorts (BR-94)', () => {
    const rows = [row('a', { [num.id]: '1' }), row('b', { [num.id]: '3' }), row('c', { [num.id]: '2' })]
    const out = groupRows(
      rows,
      view({ groupByColumnId: check.id, sorts: [{ columnId: num.id, dir: 'DESC' }] }),
      cols,
      ctx,
    )
    expect(summary(out)).toEqual([
      ['checked', []],
      ['unchecked', ['b', 'c', 'a']],
    ])
  })
  it('property: PERSON group counts add up to Σ max(1, people) per row', () => {
    const rowArb = fc.subarray([CINDY, IVY, MINT, OLD])
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 20 }), (cells) => {
        const rows: DbRowModel[] = cells.map((p, i) => row(`r${i}`, { [person.id]: p }))
        const out = groupRows(rows, view({ groupByColumnId: person.id }), cols, ctx)
        expect(out.ok).toBe(true)
        if (!out.ok) return
        const total = out.groups.reduce((s, g) => s + g.rows.length, 0)
        expect(total).toBe(cells.reduce((s, p) => s + Math.max(1, p.length), 0))
      }),
    )
  })
})

describe('groupKeyId', () => {
  it.each([
    [{ kind: 'option', id: 'x' }, 'option:x'],
    [{ kind: 'person', id: 'u' }, 'person:u'],
    [{ kind: 'checked' }, 'checked'],
    [{ kind: 'unchecked' }, 'unchecked'],
    [{ kind: 'none' }, 'none'],
  ] as const)('%j → %s', (k, id) => expect(groupKeyId(k)).toBe(id))
})

describe('dropOnGroup (BR-96 drops)', () => {
  const opt = (id: string): GroupKey => ({ kind: 'option', id })
  const p = (id: string): GroupKey => ({ kind: 'person', id })
  const none: GroupKey = { kind: 'none' }
  const r = (people?: string[]) => row('r', people ? { [person.id]: people } : {})

  it('AC-1404: Cindy+Ivy, drag from Cindy to Mint → Mint+Ivy; then from Ivy to none → Mint', () => {
    const step1 = dropOnGroup(r([CINDY, IVY]), person, p(CINDY), p(MINT))
    expect(step1).toEqual([MINT, IVY])
    expect(dropOnGroup(row('r', { [person.id]: step1 }), person, p(IVY), none)).toEqual([MINT])
  })
  it.each([
    ['A→B replaces in place', [CINDY, IVY, MINT], p(IVY), p(OLD), [CINDY, OLD, MINT]],
    ['B already present → remove A', [CINDY, IVY], p(CINDY), p(IVY), [IVY]],
    ['A→none removes A', [CINDY, IVY], p(CINDY), none, [IVY]],
    ['last person → none clears', [CINDY], p(CINDY), none, null],
    ['none→B = [B]', undefined, none, p(MINT), [MINT]],
    ['same group = unchanged', [CINDY, IVY], p(CINDY), p(CINDY), [CINDY, IVY]],
    ['stale A (not in row) → B appended', [IVY], p(CINDY), p(MINT), [IVY, MINT]],
    ['stale A, B present → unchanged', [IVY], p(CINDY), p(IVY), [IVY]],
    ['none→none = unchanged', undefined, none, none, null],
  ] as const)('PERSON: %s', (_, people, from, to, out) => {
    expect(dropOnGroup(r(people ? [...people] : undefined), person, from, to)).toEqual(out)
  })
  it('SELECT: set / clear', () => {
    const x = row('r', { [sel.id]: OPT_DOING.id })
    expect(dropOnGroup(x, sel, opt(OPT_DOING.id), opt(OPT_DONE.id))).toBe(OPT_DONE.id)
    expect(dropOnGroup(x, sel, opt(OPT_DOING.id), none)).toBeNull()
    expect(dropOnGroup(row('r'), sel, none, opt(OPT_TODO.id))).toBe(OPT_TODO.id)
  })
  it('CHECKBOX: set / clear', () => {
    expect(dropOnGroup(row('r'), check, { kind: 'unchecked' }, { kind: 'checked' })).toBe(true)
    expect(
      dropOnGroup(row('r', { [check.id]: true }), check, { kind: 'checked' }, { kind: 'unchecked' }),
    ).toBeNull()
  })
  it('a key that does not fit the column, or a non-group column, throws', () => {
    expect(() => dropOnGroup(row('r'), sel, none, p(CINDY))).toThrow(DbDomainError)
    expect(() => dropOnGroup(row('r'), sel, none, { kind: 'checked' })).toThrow(DbDomainError)
    expect(() => dropOnGroup(row('r'), check, { kind: 'unchecked' }, none)).toThrow(DbDomainError)
    expect(() => dropOnGroup(row('r'), person, none, opt('x'))).toThrow(DbDomainError)
    expect(() => dropOnGroup(row('r'), person, opt('x'), none)).toThrow(DbDomainError)
    expect(() => dropOnGroup(row('r'), multi, none, opt(OPT_DONE.id))).toThrow(DbDomainError)
  })
})
