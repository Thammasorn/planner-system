'use client'
// src/components/database/data/useDbMutations.ts — every write of one database (SPEC §4.14.7, §7.5, §7.9; plan/m11
// S3.1, M11-D14/D16/D17/D20). One scoped queue per database (`db:<id>`): the optimistic patch lands synchronously in
// qk.database (< 50 ms), the action runs in order and reads `baseVersion` from the cache at send time, the server DTO
// is reconciled. Failure → rollback (only pending write) or refetch + Thai toast; VERSION_CONFLICT → the server copy
// replaces the object, its older undo entries become no-ops, toast. New rows / columns / views / options take a
// tempId() until the server id arrives (later writes resolve it through dbIdMap). Undo entries: values, titles,
// renames, view settings, moves, new rows/columns without a toast; deletes (rows, column, view, option) and type
// changes with the 8 s "เลิกทำ" toast.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { type UndoEntry, useUndo } from '@/components/undo/useUndo'
import { defaultColumnName, OPTION_COLORS, optionKey, optionsOf } from '@/domain/database'
import type { SelectOption } from '@/domain/types'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { th } from '@/i18n/th'
import { ActionFailure, unwrap } from '@/lib/action-result'
import type {
  CellValue,
  ChangeColumnTypeResult,
  ColumnConfig,
  DatabaseResponse,
  DbColumnDTO,
  DbColumnType,
  DbRowDTO,
  DbViewDTO,
  DbViewType,
  ViewConfig,
} from '@/lib/contracts/databases'
import {
  dbIdMap,
  findById,
  insertByPosition,
  placeAfter,
  previousId,
  reconcileRow,
  remapOptionInCells,
  removeRows,
  replaceColumn,
  replaceRow,
  replaceTempRows,
  replaceView,
  resolveCells,
  resolveDbId,
  type RowPatch,
} from '@/lib/database/optimistic'
import { qk } from '@/lib/query-keys'
import { tempId } from '@/lib/temp-id'
import * as actions from '@/server/actions/databases'
import type { DbApi } from './contract'

export type DbMutations = Omit<DbApi, 'db' | 'canEdit' | 'viewerId' | 'today'>

type Target = { kind: 'database' | 'row' | 'column' | 'view'; id: string }

interface Job {
  run: () => Promise<unknown>
  done?: (r: never) => void
  /** Cache before the optimistic patch (rollback when this is the only pending write). */
  snapshot: DatabaseResponse | undefined
  target?: Target
  /** Undo/redo runs: no toast here, the rejection reaches UndoProvider (which toasts the message). */
  silent?: boolean
  /** VERSION_CONFLICT message override (revert of a type change). */
  conflictMessage?: string
}

/** Objects whose conflict replaced the cache: undo entries made before it are dropped (M11-D14). */
const conflictEpoch = new Map<string, number>()
const epochOf = (id: string): number => conflictEpoch.get(resolveDbId(id)) ?? 0

const MESSAGES_MEANING_TYPE_CHANGED = new Set<string>([
  th.database.errors.badValue,
  th.database.errors.unknownColumn,
])

function notFound(): ActionFailure {
  return new ActionFailure({ ok: false, code: 'NOT_FOUND', message: th.database.toasts.saveFailed })
}

function defaultConfig(type: DbColumnType): ColumnConfig {
  if (type === 'SELECT' || type === 'MULTI_SELECT') return { options: [] }
  if (type === 'NUMBER') return { decimals: null, thousands: true }
  return {}
}

/** Temp ids inside a column config (option ids) resolved; options still temp are sent as new (no id). */
function resolveConfig(config: ColumnConfig): ColumnConfig {
  if (!('options' in config)) return config
  return {
    options: config.options.map((o) => {
      const id = resolveDbId(o.id)
      return (id.startsWith('tmp_') ? { name: o.name, color: o.color } : { ...o, id }) as SelectOption
    }),
  }
}

/** Temp column / option ids inside a view config resolved. */
function resolveViewConfig(c: ViewConfig): ViewConfig {
  const out: ViewConfig = { ...c }
  if (c.hiddenColumnIds) out.hiddenColumnIds = c.hiddenColumnIds.map(resolveDbId)
  if (c.cardColumnIds) out.cardColumnIds = c.cardColumnIds.map(resolveDbId)
  if (c.columnWidths)
    out.columnWidths = Object.fromEntries(Object.entries(c.columnWidths).map(([k, v]) => [resolveDbId(k), v]))
  if (c.sorts) out.sorts = c.sorts.map((s) => ({ ...s, columnId: resolveDbId(s.columnId) }))
  if (c.filters)
    out.filters = c.filters.map((f) => ({
      ...f,
      columnId: resolveDbId(f.columnId),
      ...(Array.isArray(f.value) ? { value: f.value.map(resolveDbId) } : {}),
    }))
  if (c.groupByColumnId) out.groupByColumnId = resolveDbId(c.groupByColumnId)
  if (c.dateColumnId) out.dateColumnId = resolveDbId(c.dateColumnId)
  return out
}

const nowIso = (): string => new Date().toISOString()

export function useDbMutations(o: { pageId: string; databaseId: string }): DbMutations {
  const { pageId, databaseId } = o
  const qc = useQueryClient()
  const undo = useUndo()
  const viewerId = useCurrentUser()?.id ?? ''
  const mutationKey = ['databases', 'write', databaseId]

  const mutation = useMutation<unknown, Error, Job>({
    mutationKey,
    scope: { id: `db:${databaseId}` },
    mutationFn: (job) => job.run(),
    onSuccess: (r, job) => (job.done as ((x: unknown) => void) | undefined)?.(r),
    onError: (err, job) => {
      const key = qk.database(pageId, databaseId)
      const get = () => qc.getQueryData<DatabaseResponse>(key)
      const set = (fn: (d: DatabaseResponse) => DatabaseResponse) =>
        qc.setQueryData<DatabaseResponse>(key, (d) => (d ? fn(d) : d))
      const f = err instanceof ActionFailure ? err : null
      if (f?.code === 'VERSION_CONFLICT' && job.target) {
        const current = f.extra.current as Record<string, unknown> | undefined
        const t = job.target
        conflictEpoch.set(resolveDbId(t.id), epochOf(t.id) + 1)
        if (current && typeof current === 'object' && get()) {
          if (t.kind === 'row') set((d) => replaceRow(d, current as unknown as DbRowDTO))
          else if (t.kind === 'column') set((d) => replaceColumn(d, current as unknown as DbColumnDTO))
          else if (t.kind === 'view') set((d) => replaceView(d, current as unknown as DbViewDTO))
          else
            set((d) => ({
              ...d,
              title: typeof current.title === 'string' ? current.title : d.title,
              version: typeof current.version === 'number' ? current.version : d.version,
            }))
        } else void qc.invalidateQueries({ queryKey: key })
        if (!job.silent) toast.error(job.conflictMessage ?? th.database.toasts.conflict)
        return
      }
      if (qc.isMutating({ mutationKey }) <= 1 && job.snapshot) qc.setQueryData(key, job.snapshot)
      else void qc.invalidateQueries({ queryKey: key })
      if (job.silent) return
      if (f?.code === 'VALIDATION') {
        void qc.invalidateQueries({ queryKey: key })
        toast.error(MESSAGES_MEANING_TYPE_CHANGED.has(f.message) ? th.database.toasts.typeChanged : f.message)
      } else if (f?.code === 'NOT_FOUND') {
        void qc.invalidateQueries({ queryKey: key })
        toast.error(th.database.toasts.saveFailed)
      } else if (f && f.code !== 'INTERNAL' && f.message !== '') toast.error(f.message)
      else toast.error(th.database.toasts.saveFailed)
    },
  })
  const mutateAsync = mutation.mutateAsync

  return useMemo<DbMutations>(() => {
    const key = qk.database(pageId, databaseId)
    const get = (): DatabaseResponse | undefined => qc.getQueryData<DatabaseResponse>(key)
    const set = (fn: (d: DatabaseResponse) => DatabaseResponse): void => {
      qc.setQueryData<DatabaseResponse>(key, (d) => (d ? fn(d) : d))
    }
    /** Optimistic patch now, then the queued action → whether it succeeded. Silent jobs (undo/redo) reject instead
     *  of resolving false, so UndoProvider reports the failure. */
    const submit = (
      job: Omit<Job, 'snapshot'>,
      optimistic?: (d: DatabaseResponse) => DatabaseResponse,
    ): Promise<boolean> => {
      const snapshot = get()
      void qc.cancelQueries({ queryKey: key })
      if (optimistic && snapshot) set(optimistic)
      const p = mutateAsync({ ...job, snapshot }).then(() => true)
      return job.silent ? p : p.catch(() => false)
    }
    const quiet = (p: Promise<unknown>): Promise<void> => p.then(() => undefined)
    /** An undo entry that becomes a no-op once a conflict replaced one of its objects (M11-D14). */
    const guarded = (ids: string[], entry: UndoEntry): UndoEntry => {
      const epochs = ids.map(epochOf)
      const stale = () => ids.some((id, i) => epochOf(id) !== epochs[i])
      return {
        label: entry.label,
        undo: () => (stale() ? Promise.resolve() : entry.undo()),
        redo: () => (stale() ? Promise.resolve() : entry.redo()),
      }
    }
    const row = (id: string) => {
      const r = findById(get()?.rows ?? [], id)
      if (!r) throw notFound()
      return r
    }
    const column = (id: string) => {
      const c = findById(get()?.columns ?? [], id)
      if (!c) throw notFound()
      return c
    }
    const view = (id: string) => {
      const v = findById(get()?.views ?? [], id)
      if (!v) throw notFound()
      return v
    }

    // ── database title ──
    const rename = (title: string, silent: boolean): Promise<boolean> =>
      submit(
        {
          silent,
          target: { kind: 'database', id: databaseId },
          run: () => unwrap(actions.renameDatabase({ databaseId, baseVersion: get()?.version ?? 1, title })),
          done: (r: { title: string; version: number }) =>
            set((d) => ({ ...d, title: r.title, version: r.version })),
        },
        (d) => ({ ...d, title }),
      )

    // ── rows ──
    type RowWrite = RowPatch & { move?: { afterRowId: string | null } }
    const writeRow = (rowId: string, p: RowWrite, silent: boolean): Promise<boolean> =>
      submit(
        {
          silent,
          target: { kind: 'row', id: rowId },
          run: () => {
            const r = row(rowId)
            return unwrap(
              actions.updateDatabaseRow({
                rowId: r.id,
                baseVersion: r.version,
                ...(p.title !== undefined ? { title: p.title } : {}),
                ...(p.cells !== undefined ? { cells: resolveCells(p.cells) } : {}),
                ...(p.move
                  ? {
                      move: {
                        afterRowId: p.move.afterRowId === null ? null : resolveDbId(p.move.afterRowId),
                      },
                    }
                  : {}),
              }),
            )
          },
          done: (r: { row: DbRowDTO }) =>
            set((d) => reconcileRow(d, r.row, { ...p, move: p.move !== undefined })),
        },
        (d) => {
          let next = d
          if (p.title !== undefined || p.cells !== undefined)
            next = {
              ...next,
              rows: next.rows.map((r) =>
                findById([r], rowId)
                  ? {
                      ...r,
                      ...(p.title !== undefined ? { title: p.title } : {}),
                      cells: (() => {
                        const c = { ...r.cells }
                        for (const [k, v] of Object.entries(p.cells ?? {})) {
                          if (v === null) delete c[k]
                          else c[k] = v
                        }
                        return c
                      })(),
                    }
                  : r,
              ),
            }
          if (p.move) {
            const r = findById(next.rows, rowId)
            if (r) next = { ...next, rows: placeAfter(next.rows, r, p.move.afterRowId) }
          }
          return next
        },
      )

    const updateRow: DbMutations['updateRow'] = (rowId, patch, label, opts) => {
      const d = get()
      const r = d ? findById(d.rows, rowId) : undefined
      if (!d || !r) return
      const prev: RowWrite = {}
      if (patch.title !== undefined) prev.title = r.title
      if (patch.cells)
        prev.cells = Object.fromEntries(Object.keys(patch.cells).map((k) => [k, r.cells[k] ?? null]))
      if (patch.move) prev.move = { afterRowId: previousId(d.rows, rowId) }
      void writeRow(rowId, patch, false).then((ok) => {
        if (!ok || !findById(get()?.rows ?? [], rowId)) return
        const lbl =
          label ??
          (patch.move
            ? th.database.undo.move
            : patch.cells === undefined
              ? th.database.undo.title
              : th.database.undo.value)
        undo.push(
          guarded([rowId], {
            label: lbl,
            undo: () => quiet(writeRow(rowId, prev, true)),
            redo: () => quiet(writeRow(rowId, patch, true)),
          }),
          opts?.toast !== undefined ? { toast: opts.toast } : undefined,
        )
      })
    }

    /** Deletes rows (optimistic); resolves to the batch. */
    const removeRowsRun = (ids: string[], silent: boolean): Promise<string | null> => {
      let batch: string | null = null
      return submit(
        {
          silent,
          run: () => unwrap(actions.deleteDatabaseRows({ rowIds: ids.map(resolveDbId) })),
          done: (r: { batch: string }) => {
            batch = r.batch
          },
        },
        (d) => removeRows(d, ids),
      ).then(() => batch)
    }
    const restoreRowsRun = (batch: string, rows: DbRowDTO[]): Promise<void> =>
      quiet(
        submit(
          {
            silent: true,
            run: () => unwrap(actions.restoreDatabaseRowBatch({ batch })),
            done: (r: { rows: DbRowDTO[] }) => set((d) => ({ ...d, rows: insertByPosition(d.rows, r.rows) })),
          },
          (d) => ({ ...d, rows: insertByPosition(d.rows, rows) }),
        ),
      )
    /** Undo entry over a batch of rows (delete ↔ restore); `deleted` = the rows as they were. */
    const rowBatchEntry = (label: string, ids: string[], deleted: DbRowDTO[], first: string): UndoEntry => {
      let batch: string | null = first
      return {
        label,
        undo: async () => {
          if (batch === null) return
          await restoreRowsRun(batch, deleted)
          batch = null
        },
        redo: async () => {
          batch = await removeRowsRun(ids, true)
        },
      }
    }

    const createRows: DbMutations['createRows'] = (rows) => {
      const d = get()
      if (!d || rows.length === 0) return Promise.resolve([])
      const tmps = rows.map(() => tempId())
      const now = nowIso()
      const optimistic = (cur: DatabaseResponse): DatabaseResponse => {
        let list = cur.rows
        rows.forEach((r, i) => {
          const dto: DbRowDTO = {
            id: tmps[i]!,
            title: r.title ?? '',
            cells: r.cells ?? {},
            position: '',
            version: 1,
            hasBody: false,
            createdBy: viewerId,
            createdAt: now,
            updatedBy: viewerId,
            updatedAt: now,
          }
          const after = r.afterRowId !== undefined ? r.afterRowId : i > 0 ? tmps[i - 1] : undefined
          list = placeAfter(list, dto, after)
        })
        return { ...cur, rows: list }
      }
      void submit(
        {
          run: () =>
            unwrap(
              actions.createDatabaseRows({
                databaseId,
                rows: rows.map((r) => ({
                  ...(r.title !== undefined ? { title: r.title } : {}),
                  ...(r.cells !== undefined ? { cells: resolveCells(r.cells) } : {}),
                  ...(r.afterRowId !== undefined
                    ? { afterRowId: r.afterRowId === null ? null : resolveDbId(r.afterRowId) }
                    : {}),
                })),
              }),
            ),
          done: (r: { rows: DbRowDTO[] }) => {
            tmps.forEach((t, i) => {
              const real = r.rows[i]?.id
              if (real) dbIdMap.set(t, real)
            })
            set((cur) => replaceTempRows(cur, tmps, r.rows))
            const ids = r.rows.map((x) => x.id)
            let batch: string | null = null
            undo.push({
              label: th.database.undo.addRow,
              undo: async () => {
                batch = await removeRowsRun(ids, true)
              },
              redo: async () => {
                if (batch === null) return
                const b = batch
                batch = null
                await restoreRowsRun(b, r.rows)
              },
            })
          },
        },
        optimistic,
      )
      return Promise.resolve(tmps)
    }

    const deleteRows: DbMutations['deleteRows'] = (ids) => {
      const d = get()
      if (!d || ids.length === 0) return
      const deleted = d.rows.filter((r) => ids.some((id) => findById([r], id)))
      if (deleted.length === 0) return
      const real = deleted.map((r) => r.id)
      void removeRowsRun(real, false).then((batch) => {
        if (batch === null) return
        undo.push(rowBatchEntry(th.database.undo.deleteRows, real, deleted, batch), {
          toast: th.database.toasts.rowsDeleted(deleted.length),
        })
      })
    }

    // ── columns ──
    const writeColumn = (
      columnId: string,
      p: { name?: string; config?: ColumnConfig; afterColumnId?: string | null },
      silent: boolean,
    ): Promise<boolean> =>
      submit(
        {
          silent,
          target: { kind: 'column', id: columnId },
          run: () => {
            const c = column(columnId)
            return unwrap(
              actions.updateDatabaseColumn({
                columnId: c.id,
                baseVersion: c.version,
                ...(p.name !== undefined ? { name: p.name } : {}),
                ...(p.config !== undefined ? { config: resolveConfig(p.config) } : {}),
                ...(p.afterColumnId !== undefined
                  ? { afterColumnId: p.afterColumnId === null ? null : resolveDbId(p.afterColumnId) }
                  : {}),
              }),
            )
          },
          done: (r: { column: DbColumnDTO }) =>
            set((d) => {
              const next = replaceColumn(d, r.column)
              return p.afterColumnId !== undefined
                ? { ...next, columns: insertByPosition(next.columns, [r.column]) }
                : next
            }),
        },
        (d) => {
          const c = findById(d.columns, columnId)
          if (!c) return d
          const patched = {
            ...c,
            ...(p.name !== undefined ? { name: p.name } : {}),
            ...(p.config !== undefined ? { config: p.config } : {}),
          }
          const next = replaceColumn(d, patched)
          return p.afterColumnId !== undefined
            ? { ...next, columns: placeAfter(next.columns, patched, p.afterColumnId) }
            : next
        },
      )

    const updateColumn: DbMutations['updateColumn'] = (columnId, patch) => {
      const d = get()
      const c = d ? findById(d.columns, columnId) : undefined
      if (!d || !c) return
      const prev: { name?: string; config?: ColumnConfig; afterColumnId?: string | null } = {}
      if (patch.name !== undefined) prev.name = c.name
      if (patch.config !== undefined) prev.config = c.config
      if (patch.afterColumnId !== undefined) prev.afterColumnId = previousId(d.columns, columnId)
      const before = optionsOf(c)
      const after = patch.config ? optionsOf({ config: patch.config }) : before
      const removed = before.filter((x) => !after.some((y) => y.id === x.id))
      void writeColumn(columnId, patch, false).then((ok) => {
        if (!ok || !findById(get()?.columns ?? [], columnId)) return
        const entry = guarded([columnId], {
          label: removed.length > 0 ? th.database.undo.deleteOption : th.database.undo.column,
          undo: () => quiet(writeColumn(columnId, prev, true)),
          redo: () => quiet(writeColumn(columnId, patch, true)),
        })
        undo.push(
          entry,
          removed.length > 0 ? { toast: th.database.toasts.optionDeleted(removed[0]!.name) } : undefined,
        )
      })
    }

    const deleteColumnRun = (columnId: string, silent: boolean): Promise<string | null> => {
      let batch: string | null = null
      return submit(
        {
          silent,
          run: () => unwrap(actions.deleteDatabaseColumn({ columnId: resolveDbId(columnId) })),
          done: (r: { batch: string }) => {
            batch = r.batch
          },
        },
        (d) => ({ ...d, columns: d.columns.filter((c) => !findById([c], columnId)) }),
      ).then(() => batch)
    }
    const restoreColumnRun = (batch: string, col: DbColumnDTO): Promise<void> =>
      quiet(
        submit(
          {
            silent: true,
            run: () => unwrap(actions.restoreDatabaseColumnBatch({ batch })),
            done: (r: { columns: DbColumnDTO[] }) =>
              set((d) => ({ ...d, columns: insertByPosition(d.columns, r.columns) })),
          },
          (d) => ({ ...d, columns: insertByPosition(d.columns, [col]) }),
        ),
      )
    const columnBatchEntry = (label: string, col: DbColumnDTO, first: string | null): UndoEntry => {
      let batch = first
      return {
        label,
        undo: async () => {
          if (batch === null) batch = await deleteColumnRun(col.id, true)
          else {
            const b = batch
            batch = null
            await restoreColumnRun(b, col)
          }
        },
        redo: async () => {
          if (batch === null) batch = await deleteColumnRun(col.id, true)
          else {
            const b = batch
            batch = null
            await restoreColumnRun(b, col)
          }
        },
      }
    }

    const createColumn: DbMutations['createColumn'] = (type, opts) => {
      const d = get()
      if (!d) return Promise.resolve('')
      const tmp = tempId()
      const name =
        opts?.name ??
        defaultColumnName(
          th.database.types[type],
          d.columns.map((c) => c.name),
        )
      const dto: DbColumnDTO = { id: tmp, type, name, config: defaultConfig(type), position: '', version: 1 }
      void submit(
        {
          run: () =>
            unwrap(
              actions.createDatabaseColumn({
                databaseId,
                type: type as Exclude<DbColumnType, 'TITLE'>,
                name,
                ...(opts?.afterColumnId !== undefined
                  ? { afterColumnId: opts.afterColumnId === null ? null : resolveDbId(opts.afterColumnId) }
                  : {}),
              }),
            ),
          done: (r: { column: DbColumnDTO }) => {
            dbIdMap.set(tmp, r.column.id)
            set((cur) => replaceColumn(cur, r.column))
            // undo of "add column" = delete it (no toast); redo = restore
            const entry = columnBatchEntry(th.database.undo.addColumn, r.column, null)
            undo.push({ label: entry.label, undo: entry.undo, redo: entry.undo })
          },
        },
        (cur) => ({ ...cur, columns: placeAfter(cur.columns, dto, opts?.afterColumnId) }),
      )
      return Promise.resolve(tmp)
    }

    const duplicateColumn: DbMutations['duplicateColumn'] = (columnId) => {
      const d = get()
      const src = d ? findById(d.columns, columnId) : undefined
      if (!d || !src || src.type === 'TITLE') return
      const tmp = tempId()
      const copy: DbColumnDTO = { ...src, id: tmp, version: 1 }
      void submit(
        {
          run: () => unwrap(actions.duplicateDatabaseColumn({ columnId: resolveDbId(src.id) })),
          done: (r: { column: DbColumnDTO }) => {
            dbIdMap.set(tmp, r.column.id)
            set((cur) => {
              const next = replaceColumn(cur, r.column)
              return {
                ...next,
                rows: next.rows.map((row) => {
                  if (!(tmp in row.cells)) return row
                  const { [tmp]: v, ...rest } = row.cells
                  return { ...row, cells: { ...rest, [r.column.id]: v! } }
                }),
              }
            })
            const entry = columnBatchEntry(th.database.undo.addColumn, r.column, null)
            undo.push({ label: entry.label, undo: entry.undo, redo: entry.undo })
          },
        },
        (cur) => ({
          ...cur,
          columns: placeAfter(cur.columns, copy, src.id),
          rows: cur.rows.map((row) =>
            row.cells[src.id] === undefined
              ? row
              : { ...row, cells: { ...row.cells, [tmp]: row.cells[src.id]! } },
          ),
        }),
      )
    }

    type Previous = ChangeColumnTypeResult['previous']
    const applyTypeRows = (d: DatabaseResponse, columnId: string, rows: DbRowDTO[]) =>
      rows.reduce((acc, r) => reconcileRow(acc, r, { cells: { [columnId]: null } }), d)

    const changeTypeRun = (
      columnId: string,
      type: DbColumnType,
      silent: boolean,
    ): Promise<Previous | null> => {
      let previous: Previous | null = null
      return submit(
        {
          silent,
          target: { kind: 'column', id: columnId },
          run: () => {
            const c = column(columnId)
            return unwrap(
              actions.changeDatabaseColumnType({
                columnId: c.id,
                baseVersion: c.version,
                type: type as Exclude<DbColumnType, 'TITLE'>,
              }),
            )
          },
          done: (r: ChangeColumnTypeResult) => {
            previous = r.previous
            set((d) => applyTypeRows(replaceColumn(d, r.column), r.column.id, r.rows))
          },
        },
        (d) => {
          const c = findById(d.columns, columnId)
          return c ? replaceColumn(d, { ...c, type, config: defaultConfig(type) }) : d
        },
      ).then(() => previous)
    }
    const revertTypeRun = (columnId: string, previous: Previous): Promise<void> =>
      quiet(
        submit(
          {
            silent: true,
            target: { kind: 'column', id: columnId },
            conflictMessage: th.database.toasts.revertBlocked,
            run: () =>
              unwrap(actions.revertDatabaseColumnType({ columnId: resolveDbId(columnId), previous })).catch(
                (err: unknown) => {
                  if (err instanceof ActionFailure && err.code === 'VERSION_CONFLICT')
                    throw new ActionFailure({
                      ok: false,
                      code: err.code,
                      message: th.database.toasts.revertBlocked,
                      ...err.extra,
                    })
                  throw err
                },
              ),
            done: (r: { column: DbColumnDTO; rows: DbRowDTO[] }) =>
              set((d) => applyTypeRows(replaceColumn(d, r.column), r.column.id, r.rows)),
          },
          (d) => {
            const c = findById(d.columns, columnId)
            if (!c) return d
            const next = replaceColumn(d, { ...c, type: previous.type, config: previous.config })
            return {
              ...next,
              rows: next.rows.map((row) => {
                const v = previous.values[row.id]
                return v === undefined ? row : { ...row, cells: { ...row.cells, [c.id]: v } }
              }),
            }
          },
        ),
      )

    const changeColumnType: DbMutations['changeColumnType'] = (columnId, type) => {
      const c = findById(get()?.columns ?? [], columnId)
      if (!c || c.type === 'TITLE' || type === 'TITLE' || c.type === type) return
      void changeTypeRun(columnId, type, false).then((previous) => {
        if (previous === null) return
        let prev: Previous = previous
        undo.push(
          {
            label: th.database.undo.changeType,
            undo: () => revertTypeRun(columnId, prev),
            redo: async () => {
              const p = await changeTypeRun(columnId, type, true)
              if (p) prev = p
            },
          },
          { toast: th.database.toasts.typeConverted },
        )
      })
    }

    const deleteColumn: DbMutations['deleteColumn'] = (columnId) => {
      const c = findById(get()?.columns ?? [], columnId)
      if (!c || c.type === 'TITLE') return
      void deleteColumnRun(columnId, false).then((batch) => {
        if (batch === null) return
        const entry = columnBatchEntry(th.database.undo.deleteColumn, c, batch)
        undo.push(entry, { toast: th.database.toasts.columnDeleted(c.name) })
      })
    }

    // BR-90 (owner bug 2026-11-03): one option per name in a column (trimmed, case-insensitive) — typing an existing
    // name answers its id instead of creating. Each create sends the CONFIRMED options plus its own new one only:
    // sending the other still-pending creates too (without ids) created them twice or three times. The other pending
    // options stay in the optimistic column when one create is confirmed, so no chip ever shows a temp id.
    const addOption: DbMutations['addOption'] = (columnId, rawName) => {
      const c = findById(get()?.columns ?? [], columnId)
      const name = rawName.trim()
      if (!c || name === '') return Promise.resolve('')
      const same = optionsOf(c).find((o) => optionKey(o.name) === optionKey(name))
      if (same) return Promise.resolve(same.id)
      const tmp = tempId()
      const existing = optionsOf(c)
      const color = OPTION_COLORS[existing.length % OPTION_COLORS.length]!
      const pendingOf = (col: DbColumnDTO) =>
        optionsOf(col).filter((o) => resolveDbId(o.id).startsWith('tmp_'))
      let sentIds = new Set<string>()
      void submit(
        {
          target: { kind: 'column', id: columnId },
          run: () => {
            const cur = column(columnId)
            const confirmed = (
              resolveConfig({ options: [...optionsOf(cur)] }) as { options: SelectOption[] }
            ).options.filter((x) => typeof x.id === 'string')
            sentIds = new Set(confirmed.map((x) => x.id))
            // created meanwhile (another tab / an earlier create of the same name): use it, create nothing
            const dup = confirmed.find((x) => optionKey(x.name) === optionKey(name))
            if (dup) return Promise.resolve({ column: cur, reuse: dup.id })
            return unwrap(
              actions.updateDatabaseColumn({
                columnId: cur.id,
                baseVersion: cur.version,
                config: { options: [...confirmed, { name, color }] },
              }),
            )
          },
          done: (r: { column: DbColumnDTO; reuse?: string }) => {
            const created =
              r.reuse ??
              (
                optionsOf(r.column).find(
                  (x) => !sentIds.has(x.id) && optionKey(x.name) === optionKey(name),
                ) ?? optionsOf(r.column).find((x) => optionKey(x.name) === optionKey(name))
              )?.id
            if (created) dbIdMap.set(tmp, created)
            set((d) => {
              const cur = findById(d.columns, columnId)
              // keep the other creates still waiting in the queue (their chips need a name until they answer)
              const waiting = cur ? pendingOf(cur).filter((o) => o.id !== tmp) : []
              const server = r.reuse ? (cur ?? r.column) : r.column
              const merged =
                waiting.length > 0 && 'options' in server.config
                  ? {
                      ...server,
                      config: { options: [...optionsOf(server).filter((o) => o.id !== tmp), ...waiting] },
                    }
                  : server
              const next = replaceColumn(d, merged)
              return created ? remapOptionInCells(next, merged.id, tmp, created) : next
            })
          },
        },
        (d) => {
          const cur = findById(d.columns, columnId)
          return cur
            ? replaceColumn(d, { ...cur, config: { options: [...optionsOf(cur), { id: tmp, name, color }] } })
            : d
        },
      )
      return Promise.resolve(tmp)
    }

    // ── views ──
    const writeView = (
      viewId: string,
      p: { name?: string; config?: ViewConfig; afterViewId?: string | null },
      silent: boolean,
    ): Promise<boolean> =>
      submit(
        {
          silent,
          target: { kind: 'view', id: viewId },
          run: () => {
            const v = view(viewId)
            return unwrap(
              actions.updateDatabaseView({
                viewId: v.id,
                baseVersion: v.version,
                ...(p.name !== undefined ? { name: p.name } : {}),
                ...(p.config !== undefined ? { config: resolveViewConfig(p.config) } : {}),
                ...(p.afterViewId !== undefined
                  ? { afterViewId: p.afterViewId === null ? null : resolveDbId(p.afterViewId) }
                  : {}),
              }),
            )
          },
          done: (r: { view: DbViewDTO }) =>
            set((d) => {
              const next = replaceView(d, r.view)
              return p.afterViewId !== undefined
                ? { ...next, views: insertByPosition(next.views, [r.view]) }
                : next
            }),
        },
        (d) => {
          const v = findById(d.views, viewId)
          if (!v) return d
          const patched = {
            ...v,
            ...(p.name !== undefined ? { name: p.name } : {}),
            ...(p.config !== undefined ? { config: p.config } : {}),
          }
          const next = replaceView(d, patched)
          return p.afterViewId !== undefined
            ? { ...next, views: placeAfter(next.views, patched, p.afterViewId) }
            : next
        },
      )

    const updateView: DbMutations['updateView'] = (viewId, patch, label) => {
      const d = get()
      const v = d ? findById(d.views, viewId) : undefined
      if (!d || !v) return
      const prev: { name?: string; config?: ViewConfig; afterViewId?: string | null } = {}
      if (patch.name !== undefined) prev.name = v.name
      if (patch.config !== undefined) prev.config = v.config
      if (patch.afterViewId !== undefined) prev.afterViewId = previousId(d.views, viewId)
      void writeView(viewId, patch, false).then((ok) => {
        if (!ok || !findById(get()?.views ?? [], viewId)) return
        undo.push(
          guarded([viewId], {
            label: label ?? th.database.undo.viewConfig,
            undo: () => quiet(writeView(viewId, prev, true)),
            redo: () => quiet(writeView(viewId, patch, true)),
          }),
        )
      })
    }

    const createView: DbMutations['createView'] = (type, opts) => {
      const d = get()
      if (!d) return Promise.resolve('')
      const tmp = tempId()
      const src = opts?.copyFromViewId ? findById(d.views, opts.copyFromViewId) : undefined
      const n = d.views.filter((v) => v.type === type).length + 1
      const name = th.database.views.defaultName(th.database.views[type], n)
      const config: ViewConfig = { ...(src?.config ?? {}) }
      if (type === 'KANBAN' && !config.groupByColumnId) {
        const g = d.columns.find((c) => c.type === 'SELECT' || c.type === 'PERSON' || c.type === 'CHECKBOX')
        if (g) config.groupByColumnId = g.id
      }
      if (type === 'CALENDAR' && !config.dateColumnId) {
        const g = d.columns.find((c) => c.type === 'DATE')
        if (g) config.dateColumnId = g.id
      }
      const dto: DbViewDTO = { id: tmp, type, name, config, position: '', version: 1 }
      void submit(
        {
          run: () =>
            unwrap(
              actions.createDatabaseView({
                databaseId,
                type,
                name,
                ...(src ? { copyFromViewId: resolveDbId(src.id) } : {}),
              }),
            ),
          done: (r: { view: DbViewDTO; createdColumn?: DbColumnDTO }) => {
            dbIdMap.set(tmp, r.view.id)
            set((cur) => {
              const next = {
                ...cur,
                views: insertByPosition(
                  cur.views.filter((v) => v.id !== tmp),
                  [r.view],
                ),
              }
              return r.createdColumn
                ? { ...next, columns: insertByPosition(next.columns, [r.createdColumn]) }
                : next
            })
          },
        },
        (cur) => ({ ...cur, views: placeAfter(cur.views, dto, src ? src.id : undefined) }),
      )
      return Promise.resolve(tmp)
    }

    const deleteViewRun = (viewId: string, silent: boolean): Promise<string | null> => {
      let batch: string | null = null
      return submit(
        {
          silent,
          run: () => unwrap(actions.deleteDatabaseView({ viewId: resolveDbId(viewId) })),
          done: (r: { batch: string }) => {
            batch = r.batch
          },
        },
        (d) => ({ ...d, views: d.views.filter((v) => !findById([v], viewId)) }),
      ).then(() => batch)
    }
    const deleteView: DbMutations['deleteView'] = (viewId) => {
      const d = get()
      const v = d ? findById(d.views, viewId) : undefined
      if (!d || !v) return
      if (d.views.length <= 1) {
        toast.error(th.database.errors.lastView)
        return
      }
      void deleteViewRun(viewId, false).then((first) => {
        if (first === null) return
        let batch: string | null = first
        const toggle = async () => {
          if (batch === null) batch = await deleteViewRun(v.id, true)
          else {
            const b = batch
            batch = null
            await submit(
              {
                silent: true,
                run: () => unwrap(actions.restoreDatabaseViewBatch({ batch: b })),
                done: (r: { views: DbViewDTO[] }) =>
                  set((cur) => ({ ...cur, views: insertByPosition(cur.views, r.views) })),
              },
              (cur) => ({ ...cur, views: insertByPosition(cur.views, [v]) }),
            )
          }
        }
        undo.push(
          { label: th.database.undo.deleteView, undo: toggle, redo: toggle },
          {
            toast: th.database.toasts.viewDeleted(v.name),
          },
        )
      })
    }

    return {
      renameDatabase: (title) => {
        const prev = get()?.title ?? ''
        if (prev === title) return
        void rename(title, false).then((ok) => {
          if (!ok) return
          undo.push(
            guarded([databaseId], {
              label: th.database.undo.rename,
              undo: () => quiet(rename(prev, true)),
              redo: () => quiet(rename(title, true)),
            }),
          )
        })
      },
      createRows,
      updateRow,
      deleteRows,
      createColumn,
      updateColumn,
      duplicateColumn,
      changeColumnType,
      deleteColumn,
      addOption,
      createView,
      updateView,
      deleteView,
    }
  }, [qc, undo, viewerId, pageId, databaseId, mutateAsync])
}

export type { CellValue, DbViewType }
