// M11 S5.5 — database clipboard (FR-1471, M11-D13): the custom MIME, the same-tab registry, the database ids of an
// internal copy, and the paste decision (copy vs keep). Pure logic; the flow that calls copyDatabase is covered by
// paste-database.test.tsx.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DATABASE_MIME,
  databaseIdsInHtml,
  type DatabaseClip,
  encodeDatabaseClip,
  findDatabaseBlocks,
  parseDatabaseClip,
  planDatabasePaste,
  readDatabaseClip,
  REGISTRY_TTL_MS,
  rememberDatabaseClip,
  resetDatabaseClipRegistry,
  sourceOfDatabase,
  writeDatabaseClip,
} from './database-clipboard'

const PAGE_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const PAGE_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const DB1 = '9b2d5f4e-1c3a-4b5d-8e7f-0a1b2c3d4e5f'
const DB2 = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

/** DataTransfer stand-in with a writable store. */
function dataTransfer(init: Record<string, string> = {}): DataTransfer {
  const store = new Map(Object.entries(init))
  return {
    get types() {
      return [...store.keys()]
    },
    getData: (t: string) => store.get(t) ?? '',
    setData: (t: string, v: string) => void store.set(t, v),
  } as unknown as DataTransfer
}

const db = (id: string, databaseId: string, children: unknown[] = []) => ({
  id,
  type: 'database',
  props: { databaseId },
  children,
})
const para = (id: string, children: unknown[] = []) => ({ id, type: 'paragraph', content: [], children })

beforeEach(() => resetDatabaseClipRegistry())

describe('MIME payload', () => {
  const clip: DatabaseClip = { v: 1, sourcePageId: PAGE_A, cut: false, ids: [DB1, DB2] }

  it('round-trips', () => {
    expect(parseDatabaseClip(encodeDatabaseClip(clip))).toEqual(clip)
  })

  it('rejects malformed payloads (not JSON, wrong version, non-uuid ids, too many ids)', () => {
    for (const raw of [
      '',
      'nope',
      '{}',
      JSON.stringify({ ...clip, v: 2 }),
      JSON.stringify({ ...clip, sourcePageId: 'x' }),
      JSON.stringify({ ...clip, ids: ['x'] }),
      JSON.stringify({ ...clip, cut: 'yes' }),
      JSON.stringify({ ...clip, ids: Array.from({ length: 101 }, () => DB1) }),
    ])
      expect(parseDatabaseClip(raw)).toBeNull()
  })

  it('writeDatabaseClip adds the MIME next to BlockNote’s types and records the registry', () => {
    const dt = dataTransfer({ 'blocknote/html': '<div></div>', 'text/plain': 'x' })
    writeDatabaseClip(dt, clip, 1_000)
    expect(dt.types).toEqual(['blocknote/html', 'text/plain', DATABASE_MIME])
    expect(readDatabaseClip(dt)).toEqual(clip)
    expect(sourceOfDatabase(DB2, 1_000)).toEqual({ sourcePageId: PAGE_A, cut: false })
  })

  it('readDatabaseClip: null without the MIME or with a broken one', () => {
    expect(readDatabaseClip(null)).toBeNull()
    expect(readDatabaseClip(dataTransfer({ 'text/plain': 'x' }))).toBeNull()
    expect(readDatabaseClip(dataTransfer({ [DATABASE_MIME]: '{' }))).toBeNull()
  })
})

describe('registry (same tab, 60 s)', () => {
  it('expires after the TTL; the latest copy of an id wins', () => {
    rememberDatabaseClip({ v: 1, sourcePageId: PAGE_A, cut: false, ids: [DB1] }, 0)
    rememberDatabaseClip({ v: 1, sourcePageId: PAGE_B, cut: true, ids: [DB1] }, 10)
    expect(sourceOfDatabase(DB1, 10 + REGISTRY_TTL_MS)).toEqual({ sourcePageId: PAGE_B, cut: true })
    expect(sourceOfDatabase(DB1, 11 + REGISTRY_TTL_MS)).toBeNull()
    expect(sourceOfDatabase(DB2, 0)).toBeNull()
  })
})

describe('databaseIdsInHtml (BlockNote internal HTML)', () => {
  it('reads data-database-id attributes, unique, uuid only', () => {
    const html = `<div data-content-type="database" data-database-id="${DB1}"></div>
      <div data-content-type="database" data-database-id="${DB1}"></div>
      <div data-content-type="database" data-database-id="${DB2.toUpperCase()}"></div>
      <div data-content-type="database" data-database-id="javascript:x"></div>
      <div data-content-type="paragraph"></div>`
    expect(databaseIdsInHtml(html)).toEqual([DB1, DB2])
    expect(databaseIdsInHtml('')).toEqual([])
  })
})

describe('findDatabaseBlocks', () => {
  it('finds database blocks at any depth in document order, with their ids', () => {
    const doc = [para('p1', [db('b2', DB2)]), db('b1', DB1), { type: 'database' }, 'junk']
    expect(findDatabaseBlocks(doc)).toEqual([
      { blockId: 'b2', databaseId: DB2 },
      { blockId: 'b1', databaseId: DB1 },
    ])
    expect(findDatabaseBlocks(null)).toEqual([])
  })
})

describe('planDatabasePaste (M11-D13)', () => {
  const before = [db('b1', DB1)]

  it('a duplicate id in the page → copy (from the current page when the source is unknown)', () => {
    const after = [db('b1', DB1), db('n1', DB1)]
    expect(planDatabasePaste({ before, after, clip: null, currentPageId: PAGE_A })).toEqual([
      { blockId: 'n1', databaseId: DB1, action: 'copy', sourcePageId: PAGE_A },
    ])
  })

  it('a block from another page (MIME) → copy from that page', () => {
    const after = [db('b1', DB1), db('n2', DB2)]
    const clip: DatabaseClip = { v: 1, sourcePageId: PAGE_B, cut: false, ids: [DB2] }
    expect(planDatabasePaste({ before, after, clip, currentPageId: PAGE_A })).toEqual([
      { blockId: 'n2', databaseId: DB2, action: 'copy', sourcePageId: PAGE_B },
    ])
  })

  it('the registry stands in when the browser stripped the MIME', () => {
    rememberDatabaseClip({ v: 1, sourcePageId: PAGE_B, cut: false, ids: [DB2] }, 0)
    const after = [db('n2', DB2)]
    expect(planDatabasePaste({ before: [], after, clip: null, currentPageId: PAGE_A, now: 5 })).toEqual([
      { blockId: 'n2', databaseId: DB2, action: 'copy', sourcePageId: PAGE_B },
    ])
  })

  it('cut + paste in the same page keeps the id', () => {
    const clip: DatabaseClip = { v: 1, sourcePageId: PAGE_A, cut: true, ids: [DB1] }
    const after = [para('p'), db('n1', DB1)]
    expect(planDatabasePaste({ before: [para('p')], after, clip, currentPageId: PAGE_A })).toEqual([
      { blockId: 'n1', databaseId: DB1, action: 'keep' },
    ])
  })

  it('unknown source and unique id → keep (the server decides: a foreign id renders "ไม่พบฐานข้อมูล")', () => {
    expect(planDatabasePaste({ before: [], after: [db('n', DB2)], clip: null, currentPageId: PAGE_A })).toEqual([
      { blockId: 'n', databaseId: DB2, action: 'keep' },
    ])
  })

  it('a TASK body without a row yet (current page null): any known source → copy', () => {
    const clip: DatabaseClip = { v: 1, sourcePageId: PAGE_B, cut: false, ids: [DB2] }
    expect(planDatabasePaste({ before: [], after: [db('n', DB2)], clip, currentPageId: null })).toEqual([
      { blockId: 'n', databaseId: DB2, action: 'copy', sourcePageId: PAGE_B },
    ])
  })

  it('ignores blocks that were already there and blocks without a database id', () => {
    const after = [db('b1', DB1), db('n', '')]
    expect(planDatabasePaste({ before, after, clip: null, currentPageId: PAGE_A })).toEqual([])
  })

  it('the MIME source wins over the registry only for the ids it lists', () => {
    rememberDatabaseClip({ v: 1, sourcePageId: PAGE_B, cut: false, ids: [DB2] }, 0)
    const clip: DatabaseClip = { v: 1, sourcePageId: PAGE_A, cut: true, ids: [DB1] }
    const after = [db('n1', DB1), db('n2', DB2)]
    expect(planDatabasePaste({ before: [], after, clip, currentPageId: PAGE_A, now: 1 })).toEqual([
      { blockId: 'n1', databaseId: DB1, action: 'keep' },
      { blockId: 'n2', databaseId: DB2, action: 'copy', sourcePageId: PAGE_B },
    ])
  })
})
