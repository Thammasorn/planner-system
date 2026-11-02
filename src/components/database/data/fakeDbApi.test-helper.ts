// src/components/database/data/fakeDbApi.test-helper.ts — in-memory DbApi for ui tests (plan/m11 S0.12, M11-D1):
// synchronous state changes, every call recorded, uuid-shaped ids so zod schemas accept them. Semantics follow §7.9
// at the level views need (positions = array order, `null` = first, omitted = last; versions bump; deletes remove).
// Type conversion is simplified (values that do not fit the new type are dropped) — the real rules are domain
// convertColumn (S1). Use with <FakeDbApiProvider api={fake}> so components re-render after each call.
import { createElement, type ReactNode, useMemo, useSyncExternalStore } from 'react'
import type { ISODate, OptionColor } from '@/domain/types'
import { th } from '@/i18n/th'
import type {
  CellValue,
  ColumnConfig,
  DatabaseResponse,
  DbColumnDTO,
  DbColumnType,
  DbRowDTO,
  DbViewDTO,
  ViewConfig,
} from '@/lib/contracts/databases'
import { type DbApi, DbApiContext } from './contract'

export interface FakeCall {
  method: keyof Omit<DbApi, 'db' | 'canEdit' | 'viewerId' | 'today'>
  args: unknown[]
}

export interface FakeDbApi extends DbApi {
  /** Every method call in order. */
  readonly calls: FakeCall[]
  /** Replace the state (simulates a refetch / another viewer's change). */
  setDb(next: DatabaseResponse): void
  subscribe: (listener: () => void) => () => void
  /** Increments on every change (useSyncExternalStore snapshot). */
  readonly revision: number
}

const COLORS: readonly OptionColor[] = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
  'teal',
]
const NOW = '2026-09-30T03:00:00.000Z'

let seq = 0
/** Deterministic uuid-shaped id (version 4 / variant 8 nibbles). */
export function fakeId(): string {
  seq += 1
  return `00000000-0000-4000-8000-${seq.toString(16).padStart(12, '0')}`
}

const key = (i: number): string => `a${i.toString(36).padStart(4, '0')}`
const reposition = <T extends { position: string }>(list: T[]): T[] =>
  list.map((x, i) => ({ ...x, position: key(i) }))

/** Inserts `item` after `afterId` (`null` = first, `undefined` = last). */
function insertAfter<T extends { id: string; position: string }>(
  list: T[],
  item: T,
  afterId: string | null | undefined,
): T[] {
  const out = list.filter((x) => x.id !== item.id)
  const at =
    afterId === undefined ? out.length : afterId === null ? 0 : out.findIndex((x) => x.id === afterId) + 1
  out.splice(at <= 0 && afterId !== null ? out.length : at, 0, item)
  return reposition(out)
}

const defaultConfig = (type: DbColumnType): ColumnConfig =>
  type === 'SELECT' || type === 'MULTI_SELECT'
    ? { options: [] }
    : type === 'NUMBER'
      ? { decimals: null, thousands: false }
      : {}

const fits = (type: DbColumnType, v: CellValue): boolean =>
  type === 'CHECKBOX'
    ? v === true
    : type === 'MULTI_SELECT' || type === 'PERSON'
      ? Array.isArray(v)
      : typeof v === 'string'

/** A minimal database: TITLE "ชื่อ", one TABLE view, no rows. */
export function makeFakeDatabase(over: Partial<DatabaseResponse> = {}): DatabaseResponse {
  const title: DbColumnDTO = {
    id: fakeId(),
    type: 'TITLE',
    name: th.database.defaults.title,
    config: {},
    position: key(0),
    version: 1,
  }
  const view: DbViewDTO = {
    id: fakeId(),
    type: 'TABLE',
    name: th.database.views.TABLE,
    config: {},
    position: key(0),
    version: 1,
  }
  return {
    id: fakeId(),
    pageId: fakeId(),
    title: '',
    version: 1,
    canEdit: true,
    columns: [title],
    views: [view],
    rows: [],
    people: {},
    ...over,
  }
}

export function createFakeDbApi(
  init: DatabaseResponse = makeFakeDatabase(),
  opts: { canEdit?: boolean; viewerId?: string; today?: ISODate } = {},
): FakeDbApi {
  let state = init
  let revision = 0
  const listeners = new Set<() => void>()
  const calls: FakeCall[] = []
  const viewerId = opts.viewerId ?? 'u-viewer'

  const commit = (next: DatabaseResponse): void => {
    state = next
    revision += 1
    for (const l of listeners) l()
  }
  const record = (method: FakeCall['method'], args: unknown[]): void => {
    calls.push({ method, args })
  }
  const patchRow = (id: string, fn: (r: DbRowDTO) => DbRowDTO): void => {
    commit({
      ...state,
      rows: state.rows.map((r) => (r.id === id ? { ...fn(r), version: r.version + 1 } : r)),
    })
  }
  const patchColumn = (id: string, fn: (c: DbColumnDTO) => DbColumnDTO): void => {
    commit({
      ...state,
      columns: state.columns.map((c) => (c.id === id ? { ...fn(c), version: c.version + 1 } : c)),
    })
  }

  const api: FakeDbApi = {
    get db() {
      return state
    },
    canEdit: opts.canEdit ?? init.canEdit,
    viewerId,
    today: opts.today ?? '2026-09-30',
    calls,
    get revision() {
      return revision
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setDb(next) {
      commit(next)
    },

    renameDatabase(title) {
      record('renameDatabase', [title])
      commit({ ...state, title, version: state.version + 1 })
    },
    createRows(rows, o) {
      record('createRows', [rows, o])
      const ids: string[] = []
      let list = state.rows
      for (const r of rows) {
        const row: DbRowDTO = {
          id: fakeId(),
          title: r.title ?? '',
          cells: r.cells ?? {},
          position: '',
          version: 1,
          hasBody: false,
          createdBy: viewerId,
          createdAt: NOW,
          updatedBy: viewerId,
          updatedAt: NOW,
        }
        const after =
          r.afterRowId !== undefined ? r.afterRowId : ids.length > 0 ? ids[ids.length - 1] : undefined
        list = insertAfter(list, row, after)
        ids.push(row.id)
      }
      commit({ ...state, rows: list })
      return Promise.resolve(ids)
    },
    updateRow(rowId, patch, label) {
      record('updateRow', [rowId, patch, label])
      patchRow(rowId, (r) => {
        const cells = { ...r.cells }
        for (const [k, v] of Object.entries(patch.cells ?? {})) {
          if (v === null) delete cells[k]
          else cells[k] = v
        }
        return { ...r, title: patch.title ?? r.title, cells }
      })
      if (patch.move) {
        const row = state.rows.find((r) => r.id === rowId)
        if (row) commit({ ...state, rows: insertAfter(state.rows, row, patch.move.afterRowId) })
      }
    },
    deleteRows(rowIds) {
      record('deleteRows', [rowIds])
      const gone = new Set(rowIds)
      commit({ ...state, rows: state.rows.filter((r) => !gone.has(r.id)) })
    },
    createColumn(type, o) {
      record('createColumn', [type, o])
      const n = state.columns.filter((c) => c.type === type).length + 1
      const column: DbColumnDTO = {
        id: fakeId(),
        type,
        name: o?.name ?? th.database.defaults.columnName(th.database.types[type], n),
        config: defaultConfig(type),
        position: '',
        version: 1,
      }
      commit({ ...state, columns: insertAfter(state.columns, column, o?.afterColumnId) })
      return Promise.resolve(column.id)
    },
    updateColumn(columnId, patch) {
      record('updateColumn', [columnId, patch])
      patchColumn(columnId, (c) => ({ ...c, name: patch.name ?? c.name, config: patch.config ?? c.config }))
      if (patch.afterColumnId !== undefined) {
        const col = state.columns.find((c) => c.id === columnId)
        if (col) commit({ ...state, columns: insertAfter(state.columns, col, patch.afterColumnId) })
      }
    },
    duplicateColumn(columnId) {
      record('duplicateColumn', [columnId])
      const src = state.columns.find((c) => c.id === columnId)
      if (!src || src.type === 'TITLE') return
      const copy: DbColumnDTO = { ...src, id: fakeId(), version: 1 }
      commit({
        ...state,
        columns: insertAfter(state.columns, copy, src.id),
        rows: state.rows.map((r) =>
          r.cells[src.id] === undefined ? r : { ...r, cells: { ...r.cells, [copy.id]: r.cells[src.id]! } },
        ),
      })
    },
    changeColumnType(columnId, type) {
      record('changeColumnType', [columnId, type])
      const col = state.columns.find((c) => c.id === columnId)
      if (!col || col.type === 'TITLE' || type === 'TITLE') return
      patchColumn(columnId, (c) => ({ ...c, type, config: defaultConfig(type) }))
      commit({
        ...state,
        rows: state.rows.map((r) => {
          const v = r.cells[columnId]
          if (v === undefined || fits(type, v)) return r
          const { [columnId]: _drop, ...rest } = r.cells
          return { ...r, cells: rest, version: r.version + 1 }
        }),
      })
    },
    deleteColumn(columnId) {
      record('deleteColumn', [columnId])
      if (state.columns.find((c) => c.id === columnId)?.type === 'TITLE') return
      commit({ ...state, columns: state.columns.filter((c) => c.id !== columnId) })
    },
    addOption(columnId, name) {
      record('addOption', [columnId, name])
      const id = fakeId()
      patchColumn(columnId, (c) => {
        const options = 'options' in c.config ? c.config.options : []
        const color = COLORS[options.length % COLORS.length]!
        return { ...c, config: { options: [...options, { id, name, color }] } }
      })
      return Promise.resolve(id)
    },
    createView(type, o) {
      record('createView', [type, o])
      const n = state.views.filter((v) => v.type === type).length + 1
      const src = o?.copyFromViewId ? state.views.find((v) => v.id === o.copyFromViewId) : undefined
      const config: ViewConfig = { ...(src?.config ?? {}) }
      if (type === 'KANBAN' && !config.groupByColumnId)
        config.groupByColumnId = state.columns.find((c) =>
          ['SELECT', 'PERSON', 'CHECKBOX'].includes(c.type),
        )?.id
      if (type === 'CALENDAR' && !config.dateColumnId)
        config.dateColumnId = state.columns.find((c) => c.type === 'DATE')?.id
      const view: DbViewDTO = {
        id: fakeId(),
        type,
        name: th.database.views.defaultName(th.database.views[type], n),
        config,
        position: '',
        version: 1,
      }
      commit({ ...state, views: insertAfter(state.views, view, src?.id) })
      return Promise.resolve(view.id)
    },
    updateView(viewId, patch, label) {
      record('updateView', [viewId, patch, label])
      commit({
        ...state,
        views: state.views.map((v) =>
          v.id === viewId
            ? { ...v, name: patch.name ?? v.name, config: patch.config ?? v.config, version: v.version + 1 }
            : v,
        ),
      })
      if (patch.afterViewId !== undefined) {
        const view = state.views.find((v) => v.id === viewId)
        if (view) commit({ ...state, views: insertAfter(state.views, view, patch.afterViewId) })
      }
    },
    deleteView(viewId) {
      record('deleteView', [viewId])
      if (state.views.length <= 1) return // th.database.errors.lastView
      commit({ ...state, views: state.views.filter((v) => v.id !== viewId) })
    },
  }
  return api
}

/** Provides `api` through DbApiContext and re-renders consumers after every change. */
export function FakeDbApiProvider(p: { api: FakeDbApi; children?: ReactNode }): ReactNode {
  const revision = useSyncExternalStore(
    p.api.subscribe,
    () => p.api.revision,
    () => p.api.revision,
  )
  const value = useMemo<DbApi>(
    () => ({ ...p.api, db: p.api.db }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision is the change signal of the mutable fake
    [p.api, revision],
  )
  return createElement(DbApiContext.Provider, { value }, p.children)
}
