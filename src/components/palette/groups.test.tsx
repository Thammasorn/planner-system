// databaseItem (FR-1474): the subtitle of a nested database hit carries the breadcrumb root page › outer database ›
// outer row (FR-1453 rev. 2026-11-03); empty titles fall back to the untitled labels.
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import type { DatabaseSearchHit } from '@/lib/contracts/search'
import { databaseItem } from './groups'

const hit = (over: Partial<DatabaseSearchHit> = {}): DatabaseSearchHit => ({
  kind: 'database',
  rowId: null,
  databaseId: 'db3',
  pageId: 'body2',
  rowTitle: null,
  databaseTitle: 'งานย่อย',
  pageTitle: 'POS charter',
  trail: [],
  matchedIn: 'database',
  href: '/r/row2?db=db3',
  ...over,
})

describe('databaseItem — nested breadcrumb', () => {
  it('level 1: the owner page only', () => {
    expect(databaseItem(hit()).subtitle).toBe('POS charter')
  })

  it('nested database: root › outer database › outer row (untitled fallbacks)', () => {
    const item = databaseItem(
      hit({
        trail: [
          { kind: 'database', title: 'ลูกค้า' },
          { kind: 'row', title: '' },
        ],
      }),
    )
    expect(item.subtitle).toBe(`POS charter › ลูกค้า › ${th.database.table.untitledRow}`)
    expect(item.href).toBe('/r/row2?db=db3')
  })

  it('nested row hit: database · breadcrumb', () => {
    const item = databaseItem(
      hit({ rowId: 'r9', rowTitle: 'การ์ด', matchedIn: 'row', trail: [{ kind: 'database', title: '' }, { kind: 'row', title: 'แถว 1' }] }),
    )
    expect(item.title).toBe('การ์ด')
    expect(item.subtitle).toBe(`งานย่อย · POS charter › ${th.database.untitled} › แถว 1`)
  })
})
