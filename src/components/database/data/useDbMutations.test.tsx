// plan/m11 S3.1 (test-first): the client data layer — optimistic patches, rollback, VERSION_CONFLICT, undo entries.
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUndo } from '@/components/undo/useUndo'
import { th } from '@/i18n/th'
import type { DatabaseResponse, DbColumnDTO, DbRowDTO } from '@/lib/contracts/databases'
import { dbIdMap } from '@/lib/database/optimistic'
import { qk } from '@/lib/query-keys'
import { makeQueryClient, Providers } from '../render.test.helper'
import { useDbMutations } from './useDbMutations'

const a = vi.hoisted(() => ({
  renameDatabase: vi.fn(),
  createDatabaseRows: vi.fn(),
  updateDatabaseRow: vi.fn(),
  deleteDatabaseRows: vi.fn(),
  restoreDatabaseRowBatch: vi.fn(),
  createDatabaseColumn: vi.fn(),
  updateDatabaseColumn: vi.fn(),
  duplicateDatabaseColumn: vi.fn(),
  changeDatabaseColumnType: vi.fn(),
  revertDatabaseColumnType: vi.fn(),
  deleteDatabaseColumn: vi.fn(),
  restoreDatabaseColumnBatch: vi.fn(),
  createDatabaseView: vi.fn(),
  updateDatabaseView: vi.fn(),
  deleteDatabaseView: vi.fn(),
  restoreDatabaseViewBatch: vi.fn(),
}))
vi.mock('@/server/actions/databases', () => a)

const ok = <T extends object>(v: T) => Promise.resolve({ ok: true as const, ...v })
const fail = (code: string, message: string, extra: object = {}) =>
  Promise.resolve({ ok: false as const, code, message, ...extra })

const PAGE = 'page-1'
const DB = 'db-1'
const title: DbColumnDTO = {
  id: 'c-title',
  type: 'TITLE',
  name: 'ชื่อ',
  config: {},
  position: 'a0',
  version: 1,
}
const text: DbColumnDTO = {
  id: 'c-text',
  type: 'TEXT',
  name: 'ข้อความ',
  config: {},
  position: 'a1',
  version: 1,
}
const row = (id: string, position: string, cells: DbRowDTO['cells'] = {}, version = 1): DbRowDTO => ({
  id,
  title: id,
  cells,
  position,
  version,
  hasBody: false,
  createdBy: 'u-cindy',
  createdAt: '2026-09-30T03:00:00.000Z',
  updatedBy: 'u-cindy',
  updatedAt: '2026-09-30T03:00:00.000Z',
})
const initial = (): DatabaseResponse => ({
  id: DB,
  pageId: PAGE,
  title: 'ทะเบียน',
  version: 1,
  canEdit: true,
  columns: [title, text],
  views: [{ id: 'v1', type: 'TABLE', name: 'ตาราง', config: {}, position: 'a0', version: 1 }],
  rows: [row('r1', 'a0', { 'c-text': 'old' }), row('r2', 'a1')],
  people: {},
})

function setup() {
  const qc = makeQueryClient()
  qc.setQueryData(qk.database(PAGE, DB), initial())
  const wrapper = ({ children }: { children: ReactNode }) => <Providers qc={qc}>{children}</Providers>
  const hook = renderHook(() => ({ m: useDbMutations({ pageId: PAGE, databaseId: DB }), undo: useUndo() }), {
    wrapper,
  })
  const data = () => qc.getQueryData<DatabaseResponse>(qk.database(PAGE, DB))!
  return { qc, hook, data }
}

beforeEach(() => {
  for (const f of Object.values(a)) f.mockReset()
})
afterEach(() => dbIdMap.clear())

describe('useDbMutations (M11-D20)', () => {
  it('a cell edit is visible synchronously and sends the row version', async () => {
    a.updateDatabaseRow.mockReturnValue(ok({ row: row('r1', 'a0', { 'c-text': 'new' }, 2) }))
    const { hook, data } = setup()
    act(() => hook.result.current.m.updateRow('r1', { cells: { 'c-text': 'new' } }))
    expect(data().rows[0]!.cells['c-text']).toBe('new')
    await waitFor(() => expect(data().rows[0]!.version).toBe(2))
    expect(a.updateDatabaseRow).toHaveBeenCalledWith({
      rowId: 'r1',
      baseVersion: 1,
      cells: { 'c-text': 'new' },
    })
  })

  it('rolls back and toasts when the save fails', async () => {
    a.updateDatabaseRow.mockReturnValue(fail('INTERNAL', 'x'))
    const { hook, data } = setup()
    act(() => hook.result.current.m.updateRow('r1', { cells: { 'c-text': 'new' } }))
    expect(data().rows[0]!.cells['c-text']).toBe('new')
    await waitFor(() => expect(data().rows[0]!.cells['c-text']).toBe('old'))
    expect(await screen.findByText(th.database.toasts.saveFailed)).toBeInTheDocument()
  })

  it('VERSION_CONFLICT replaces the row with the server copy and toasts', async () => {
    const current = { ...row('r1', 'a0', { 'c-text': 'theirs' }, 5), title: 'theirs' }
    a.updateDatabaseRow.mockReturnValue(fail('VERSION_CONFLICT', 'conflict', { current }))
    const { hook, data } = setup()
    act(() => hook.result.current.m.updateRow('r1', { title: 'mine' }))
    expect(data().rows[0]!.title).toBe('mine')
    await waitFor(() => expect(data().rows[0]!.title).toBe('theirs'))
    expect(data().rows[0]!.version).toBe(5)
    expect(await screen.findByText(th.database.toasts.conflict)).toBeInTheDocument()
  })

  it('undo of a value writes the previous value with the latest version', async () => {
    a.updateDatabaseRow
      .mockReturnValueOnce(ok({ row: row('r1', 'a0', { 'c-text': 'new' }, 2) }))
      .mockReturnValueOnce(ok({ row: row('r1', 'a0', { 'c-text': 'old' }, 3) }))
    const { hook, data } = setup()
    act(() => hook.result.current.m.updateRow('r1', { cells: { 'c-text': 'new' } }))
    await waitFor(() => expect(data().rows[0]!.version).toBe(2))
    await act(() => hook.result.current.undo.undo())
    expect(a.updateDatabaseRow).toHaveBeenLastCalledWith({
      rowId: 'r1',
      baseVersion: 2,
      cells: { 'c-text': 'old' },
    })
    await waitFor(() => expect(data().rows[0]!.cells['c-text']).toBe('old'))
    expect(screen.queryByRole('button', { name: th.undo.undo })).not.toBeInTheDocument()
  })

  it('new rows get a temp id at once, then the server id; a queued edit resolves it', async () => {
    a.createDatabaseRows.mockReturnValue(ok({ rows: [row('r-new', 'a2')] }))
    a.updateDatabaseRow.mockReturnValue(ok({ row: { ...row('r-new', 'a2', {}, 2), title: 'ชื่อใหม่' } }))
    const { hook, data } = setup()
    let ids: string[] = []
    await act(async () => {
      ids = await hook.result.current.m.createRows([{ cells: { 'c-text': 'x' } }])
    })
    expect(ids[0]).toMatch(/^tmp_/)
    act(() => hook.result.current.m.updateRow(ids[0]!, { title: 'ชื่อใหม่' }))
    await waitFor(() => expect(a.updateDatabaseRow).toHaveBeenCalled())
    expect(a.createDatabaseRows).toHaveBeenCalledWith({
      databaseId: DB,
      rows: [{ cells: { 'c-text': 'x' } }],
    })
    expect(a.updateDatabaseRow).toHaveBeenCalledWith({ rowId: 'r-new', baseVersion: 1, title: 'ชื่อใหม่' })
    await waitFor(() => expect(data().rows.map((r) => r.id)).toEqual(['r1', 'r2', 'r-new']))
  })

  it('deleting rows toasts "เลิกทำ" that restores the batch', async () => {
    a.deleteDatabaseRows.mockReturnValue(ok({ batch: 'b1' }))
    a.restoreDatabaseRowBatch.mockReturnValue(ok({ rows: [row('r1', 'a0', { 'c-text': 'old' }, 2)] }))
    const { hook, data } = setup()
    act(() => hook.result.current.m.deleteRows(['r1']))
    expect(data().rows.map((r) => r.id)).toEqual(['r2'])
    await userEvent.click(await screen.findByRole('button', { name: th.undo.undo }))
    await waitFor(() => expect(a.restoreDatabaseRowBatch).toHaveBeenCalledWith({ batch: 'b1' }))
    expect(screen.getByText(th.database.toasts.rowsDeleted(1), { exact: false })).toBeInTheDocument()
    await waitFor(() => expect(data().rows.map((r) => r.id)).toEqual(['r1', 'r2']))
  })

  it('a type change toasts and its undo calls revertDatabaseColumnType(previous)', async () => {
    const previous = { type: 'TEXT' as const, config: {}, columnVersion: 2, values: { r1: 'old' } }
    a.changeDatabaseColumnType.mockReturnValue(
      ok({
        column: { ...text, type: 'NUMBER', config: { decimals: null, thousands: true }, version: 2 },
        rows: [],
        previous,
      }),
    )
    a.revertDatabaseColumnType.mockReturnValue(ok({ column: { ...text, version: 3 }, rows: [] }))
    const { hook, data } = setup()
    act(() => hook.result.current.m.changeColumnType('c-text', 'NUMBER'))
    expect(data().columns[1]!.type).toBe('NUMBER')
    expect(await screen.findByText(th.database.toasts.typeConverted, { exact: false })).toBeInTheDocument()
    expect(a.changeDatabaseColumnType).toHaveBeenCalledWith({
      columnId: 'c-text',
      baseVersion: 1,
      type: 'NUMBER',
    })
    await userEvent.click(screen.getByRole('button', { name: th.undo.undo }))
    await waitFor(() =>
      expect(a.revertDatabaseColumnType).toHaveBeenCalledWith({ columnId: 'c-text', previous }),
    )
    await waitFor(() => expect(data().columns[1]!.type).toBe('TEXT'))
  })

  it('a deleted option toasts and its undo restores the previous options', async () => {
    const sel: DbColumnDTO = {
      id: 'c-sel',
      type: 'SELECT',
      name: 'สถานะ',
      config: { options: [{ id: 'o1', name: 'กำลังทำ', color: 'blue' }] },
      position: 'a2',
      version: 1,
    }
    const qcSetup = setup()
    qcSetup.qc.setQueryData(qk.database(PAGE, DB), { ...initial(), columns: [title, text, sel] })
    a.updateDatabaseColumn
      .mockReturnValueOnce(ok({ column: { ...sel, config: { options: [] }, version: 2 } }))
      .mockReturnValueOnce(ok({ column: { ...sel, version: 3 } }))
    act(() => qcSetup.hook.result.current.m.updateColumn('c-sel', { config: { options: [] } }))
    await userEvent.click(await screen.findByRole('button', { name: th.undo.undo }))
    await waitFor(() =>
      expect(a.updateDatabaseColumn).toHaveBeenLastCalledWith({
        columnId: 'c-sel',
        baseVersion: 2,
        config: { options: [{ id: 'o1', name: 'กำลังทำ', color: 'blue' }] },
      }),
    )
  })

  it('a VALIDATION failure rolls back and shows the server message (limits)', async () => {
    a.createDatabaseRows.mockReturnValue(fail('VALIDATION', th.database.errors.limit.rows(1000)))
    const { hook, data } = setup()
    act(() => void hook.result.current.m.createRows([{}]))
    expect(data().rows).toHaveLength(3)
    await waitFor(() => expect(data().rows).toHaveLength(2))
    expect(await screen.findByText(th.database.errors.limit.rows(1000))).toBeInTheDocument()
  })
})

describe('addOption (BR-90, owner bug 2026-11-03: duplicate options, temp ids in chips)', () => {
  const tags: DbColumnDTO = {
    id: 'c-tags',
    type: 'MULTI_SELECT',
    name: 'ป้าย',
    config: { options: [{ id: 'o-old', name: 'เดิม', color: 'gray' }] },
    position: 'a2',
    version: 1,
  }
  /** A slow server that assigns ids, rejects duplicate names and unknown option ids like the real one. */
  function slowServer() {
    let col: DbColumnDTO = tags
    let n = 0
    const later = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 15))
    a.updateDatabaseColumn.mockImplementation(
      (input: {
        baseVersion: number
        config: { options: { id?: string; name: string; color: string }[] }
      }) => {
        const names = input.config.options.map((o) => o.name.trim().toLocaleLowerCase())
        if (new Set(names).size !== names.length)
          return later({
            ok: false as const,
            code: 'VALIDATION',
            message: th.database.errors.duplicateOption,
          })
        col = {
          ...col,
          version: col.version + 1,
          config: {
            options: input.config.options.map((o) => ({ ...o, id: o.id ?? `o-srv-${++n}` })),
          } as DbColumnDTO['config'],
        }
        return later({ ok: true as const, column: col })
      },
    )
    a.updateDatabaseRow.mockImplementation((input: { rowId: string; cells: Record<string, string[]> }) => {
      const known = new Set((col.config as { options: { id: string }[] }).options.map((o) => o.id))
      const ids = input.cells['c-tags'] ?? []
      if (!ids.every((id) => known.has(id)))
        return later({ ok: false as const, code: 'VALIDATION', message: 'unknown option' })
      return later({ ok: true as const, row: row(input.rowId, 'a0', { 'c-tags': ids }, 2) })
    })
    return { names: () => (col.config as { options: { name: string }[] }).options.map((o) => o.name) }
  }

  it('three quick creates (one repeated in another case) → three options once each; the cell ends with server ids', async () => {
    const server = slowServer()
    const s = setup()
    s.qc.setQueryData(qk.database(PAGE, DB), { ...initial(), columns: [title, text, tags] })
    const m = () => s.hook.result.current.m
    const ids: string[] = []
    await act(async () => {
      ids.push(await m().addOption('c-tags', 'qwer'))
      ids.push(await m().addOption('c-tags', 'asdf'))
      ids.push(await m().addOption('c-tags', ' QWER ')) // BR-90: the pending "qwer", not a new option
      ids.push(await m().addOption('c-tags', 'หกด'))
      m().updateRow('r1', { cells: { 'c-tags': [ids[0]!, ids[1]!, ids[3]!] } })
    })
    expect(ids[2]).toBe(ids[0])
    // while waiting, every chip has a name (no temp id ever shown)
    const optionNames = () =>
      (s.data().columns[2]!.config as { options: { id: string; name: string }[] }).options.map((o) => o.name)
    expect(optionNames()).toEqual(['เดิม', 'qwer', 'asdf', 'หกด'])
    await waitFor(() => expect(s.data().rows[0]!.version).toBe(2), { timeout: 2000 })
    expect(server.names()).toEqual(['เดิม', 'qwer', 'asdf', 'หกด'])
    expect(optionNames()).toEqual(['เดิม', 'qwer', 'asdf', 'หกด'])
    const cell = s.data().rows[0]!.cells['c-tags'] as string[]
    expect(cell.every((id) => id.startsWith('o-srv-'))).toBe(true)
    expect(a.updateDatabaseColumn).toHaveBeenCalledTimes(3)
    for (const [input] of a.updateDatabaseColumn.mock.calls as [{ config: { options: { id?: string }[] } }][])
      expect(input.config.options.filter((o) => o.id === undefined)).toHaveLength(1) // only its own new option
  })

  it('an existing name in another case answers the existing id without a server call', async () => {
    slowServer()
    const s = setup()
    s.qc.setQueryData(qk.database(PAGE, DB), { ...initial(), columns: [title, text, tags] })
    let id = ''
    await act(async () => {
      id = await s.hook.result.current.m.addOption('c-tags', '  เดิม ')
    })
    expect(id).toBe('o-old')
    expect(a.updateDatabaseColumn).not.toHaveBeenCalled()
  })
})
