'use server'
// src/server/actions/databases.ts — the §7.9 database actions, names verbatim (SPEC §4.14, §7.9; plan/m11 S0.7).
// Shape: zod → db.transaction(service: authz first (owner page of the database / row / column / view) → write →
// one audit row 'database' (M11-D5)) → result. No refresh()/revalidate: the client patches qk.database (M11-D20).
import type {
  ChangeColumnTypeResult,
  ColumnResult,
  CopyDatabaseResult,
  CreateDatabaseResult,
  CreateDatabaseRowsResult,
  DeleteBatchResult,
  RenameDatabaseResult,
  RestoreColumnBatchResult,
  RestoreRowBatchResult,
  RestoreViewBatchResult,
  RevertColumnTypeResult,
  UpdateDatabaseRowResult,
  ViewResult,
} from '@/lib/contracts/databases'
import {
  changeDatabaseColumnTypeSchema,
  copyDatabaseSchema,
  createDatabaseColumnSchema,
  createDatabaseRowsSchema,
  createDatabaseSchema,
  createDatabaseViewSchema,
  deleteDatabaseColumnSchema,
  deleteDatabaseRowsSchema,
  deleteDatabaseViewSchema,
  duplicateDatabaseColumnSchema,
  renameDatabaseSchema,
  restoreDatabaseColumnBatchSchema,
  restoreDatabaseRowBatchSchema,
  restoreDatabaseViewBatchSchema,
  revertDatabaseColumnTypeSchema,
  updateDatabaseColumnSchema,
  updateDatabaseRowSchema,
  updateDatabaseViewSchema,
} from '@/lib/schemas/databases'
import { action } from '../action'
import { serverToday } from '../clock'
import { db } from '../db/client'
import * as databaseCopy from '../services/database-copy'
import * as databases from '../services/databases'

export const createDatabase = action(createDatabaseSchema, (input, { user }): Promise<CreateDatabaseResult> =>
  db.transaction((tx) => databases.createDatabase(tx, user, input)),
)

export const copyDatabase = action(copyDatabaseSchema, (input, { user }): Promise<CopyDatabaseResult> =>
  db.transaction((tx) => databaseCopy.copyDatabase(tx, user, input)),
)

export const renameDatabase = action(renameDatabaseSchema, (input, { user }): Promise<RenameDatabaseResult> =>
  db.transaction((tx) => databases.renameDatabase(tx, user, input)),
)

export const createDatabaseRows = action(
  createDatabaseRowsSchema,
  (input, { user }): Promise<CreateDatabaseRowsResult> =>
    db.transaction((tx) => databases.createRows(tx, user, input)),
)

export const updateDatabaseRow = action(
  updateDatabaseRowSchema,
  (input, { user }): Promise<UpdateDatabaseRowResult> =>
    db.transaction((tx) => databases.updateRow(tx, user, input)),
)

export const deleteDatabaseRows = action(
  deleteDatabaseRowsSchema,
  (input, { user }): Promise<DeleteBatchResult> =>
    db.transaction((tx) => databases.deleteRows(tx, user, input)),
)

export const restoreDatabaseRowBatch = action(
  restoreDatabaseRowBatchSchema,
  (input, { user }): Promise<RestoreRowBatchResult> =>
    db.transaction((tx) => databases.restoreRowBatch(tx, user, input)),
)

export const createDatabaseColumn = action(
  createDatabaseColumnSchema,
  (input, { user }): Promise<ColumnResult> => db.transaction((tx) => databases.createColumn(tx, user, input)),
)

export const updateDatabaseColumn = action(
  updateDatabaseColumnSchema,
  (input, { user }): Promise<ColumnResult> => db.transaction((tx) => databases.updateColumn(tx, user, input)),
)

export const duplicateDatabaseColumn = action(
  duplicateDatabaseColumnSchema,
  (input, { user }): Promise<ColumnResult> =>
    db.transaction((tx) => databases.duplicateColumn(tx, user, input)),
)

export const changeDatabaseColumnType = action(
  changeDatabaseColumnTypeSchema,
  (input, { user }): Promise<ChangeColumnTypeResult> =>
    db.transaction((tx) => databases.changeColumnType(tx, user, input, serverToday())),
)

export const revertDatabaseColumnType = action(
  revertDatabaseColumnTypeSchema,
  (input, { user }): Promise<RevertColumnTypeResult> =>
    db.transaction((tx) => databases.revertColumnType(tx, user, input)),
)

export const deleteDatabaseColumn = action(
  deleteDatabaseColumnSchema,
  (input, { user }): Promise<DeleteBatchResult> =>
    db.transaction((tx) => databases.deleteColumn(tx, user, input)),
)

export const restoreDatabaseColumnBatch = action(
  restoreDatabaseColumnBatchSchema,
  (input, { user }): Promise<RestoreColumnBatchResult> =>
    db.transaction((tx) => databases.restoreColumnBatch(tx, user, input)),
)

export const createDatabaseView = action(createDatabaseViewSchema, (input, { user }): Promise<ViewResult> =>
  db.transaction((tx) => databases.createView(tx, user, input)),
)

export const updateDatabaseView = action(updateDatabaseViewSchema, (input, { user }): Promise<ViewResult> =>
  db.transaction((tx) => databases.updateView(tx, user, input)),
)

export const deleteDatabaseView = action(
  deleteDatabaseViewSchema,
  (input, { user }): Promise<DeleteBatchResult> =>
    db.transaction((tx) => databases.deleteView(tx, user, input)),
)

export const restoreDatabaseViewBatch = action(
  restoreDatabaseViewBatchSchema,
  (input, { user }): Promise<RestoreViewBatchResult> =>
    db.transaction((tx) => databases.restoreViewBatch(tx, user, input)),
)
