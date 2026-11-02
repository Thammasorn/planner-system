import { describe, expect, it } from 'vitest'
import { ERROR_STATUS, type ErrorCode } from '@/lib/action-result'
import { th } from './th'

type Leaf = { path: string; value: unknown }

function leaves(node: unknown, path = 'th'): Leaf[] {
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) => leaves(value, `${path}.${key}`))
  }
  return [{ path, value: node }]
}

describe('th', () => {
  it('has the M0 and M1 namespaces', () => {
    expect(Object.keys(th)).toEqual(
      expect.arrayContaining([
        'meta',
        'common',
        'nav',
        'errors',
        'home',
        'auth',
        'account',
        'employees',
        'positions',
        'users',
        'prefs',
        'undo',
        'audit',
      ]),
    )
  })

  it('U-I18N-01 every ErrorCode has a non-empty th.errors entry', () => {
    const codes = Object.keys(ERROR_STATUS) as ErrorCode[]
    expect(codes.length).toBeGreaterThan(0)
    for (const code of codes) {
      const message: unknown = th.errors[code]
      expect(typeof message, code).toBe('string')
      expect((message as string).length, code).toBeGreaterThan(0)
    }
  })

  it('auth messages are shared with the error codes', () => {
    expect(th.auth.errors.LOGIN_LOCKED).toBe(th.errors.LOGIN_LOCKED)
    expect(th.auth.errors.ACCOUNT_DEACTIVATED).toBe(th.errors.ACCOUNT_DEACTIVATED)
    expect(th.auth.errors.INVALID_CREDENTIALS).toBe(th.errors.INVALID_CREDENTIALS)
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
    expect(th.home.greetingFor.afternoon('Cindy')).toBe('สวัสดีตอนบ่าย Cindy')
    expect(th.nav.toggleHint(th.nav.collapseSidebar)).toBe('ย่อแถบด้านข้าง (⌘ \\ หรือ Ctrl + \\)')
  })

  it('M10 namespaces and parameterised strings (M10-D28)', () => {
    expect(Object.keys(th)).toEqual(
      expect.arrayContaining(['home', 'search', 'palette', 'editor', 'shortcuts']),
    )
    expect(th.home.greetingFor.morning('Cindy')).toBe('สวัสดีตอนเช้า Cindy')
    expect(th.home.myTasks.more(3)).toBe('และอีก 3 งาน')
    expect(th.editor.liveBlocks.seeAll(42)).toBe('ดูทั้งหมด (42)')
    expect(th.palette.createTask.created('ก', 'POS')).toBe('สร้างงาน "ก" ใน POS แล้ว')
    expect(Object.keys(th.palette.groups)).toEqual(['projects', 'tasks', 'pages', 'people', 'clients'])
  })
})
