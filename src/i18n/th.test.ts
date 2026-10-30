import { describe, expect, it } from 'vitest'
import { th } from './th'

type Leaf = { path: string; value: unknown }

function leaves(node: unknown, path = 'th'): Leaf[] {
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) => leaves(value, `${path}.${key}`))
  }
  return [{ path, value: node }]
}

describe('th', () => {
  it('has the M0 namespaces', () => {
    expect(Object.keys(th)).toEqual(expect.arrayContaining(['meta', 'common', 'nav', 'errors', 'home']))
  })

  it('has no empty or untrimmed strings', () => {
    const all = leaves(th)
    expect(all.length).toBeGreaterThan(0)
    for (const { path, value } of all) {
      if (typeof value === 'string') {
        expect(value.length, path).toBeGreaterThan(0)
        expect(value, path).toBe(value.trim())
      } else if (typeof value === 'function') {
        const fn = value as (...args: string[]) => unknown
        const out = fn(...Array.from({ length: fn.length }, () => 'x'))
        expect(typeof out, path).toBe('string')
        expect((out as string).length, path).toBeGreaterThan(0)
      } else {
        throw new Error(`${path} is neither a string nor a function`)
      }
    }
  })

  it('UI labels are Thai', () => {
    for (const label of [th.nav.home, th.home.title, th.errors.notFoundPage.title]) {
      expect(label).toMatch(/[฀-๿]/)
    }
  })

  it('builds parameterised strings', () => {
    expect(th.home.today('30 ก.ย. 2569')).toBe('วันนี้ 30 ก.ย. 2569')
    expect(th.nav.toggleHint(th.nav.collapseSidebar)).toBe('ย่อแถบด้านข้าง (⌘ \\ หรือ Ctrl + \\)')
  })
})
