// S2.2 — Thai BlockNote dictionary with English search aliases (FR-520).
import { en } from '@blocknote/core/locales'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { buildThaiDictionary, thaiDictionary } from './dictionary'

describe('thaiDictionary', () => {
  it('every slash item has the Thai title, subtext and group', () => {
    const keys = Object.keys(en.slash_menu) as (keyof typeof en.slash_menu)[]
    expect(keys.length).toBeGreaterThan(10)
    for (const k of keys) {
      expect(thaiDictionary.slash_menu[k].title, k).toBe(th.editor.blocknote.slash_menu[k].title)
      expect(thaiDictionary.slash_menu[k].group, k).toBe(th.editor.blocknote.slash_menu[k].group)
    }
  })

  it('keeps English titles and aliases searchable ("/table", "/h1")', () => {
    expect(thaiDictionary.slash_menu.table.aliases).toContain('table')
    expect(thaiDictionary.slash_menu.heading.aliases).toContain('h1')
    expect(thaiDictionary.slash_menu.image.aliases).toContain('image')
  })

  it('keeps the Thai aliases, without duplicates', () => {
    expect(thaiDictionary.slash_menu.image.aliases).toContain('รูป')
    for (const item of Object.values(thaiDictionary.slash_menu))
      expect(new Set(item.aliases).size).toBe(item.aliases.length)
  })

  it('passes the rest of the Thai dictionary through', () => {
    const d = buildThaiDictionary()
    expect(d.placeholders).toBe(th.editor.blocknote.placeholders)
    expect(d.table_handle).toBe(th.editor.blocknote.table_handle)
  })
})
