// src/lib/schemas/databases.ts — inputs of the §7.9 database actions and the GET route (SPEC §4.14, §5.11, §7.9;
// plan/m11 S0.5, M11-D14/D15/D23/D37). Ids are z.uuid() (X47, X86); Thai messages only via th (limits from DB_LIMITS).
// Shapes only: whether a value fits the column's current type/options is the service's job (domain normalizeCellInput).
import { th } from '@/i18n/th'
import type { FilterOp } from '@/domain/types'
import { z } from '@/lib/z'
import { DB_LIMITS as L } from './db-limits'

export { DB_LIMITS } from './db-limits'

const lim = th.database.errors.limit

export const dbColumnTypeSchema = z.enum([
  'TITLE',
  'TEXT',
  'NUMBER',
  'SELECT',
  'MULTI_SELECT',
  'DATE',
  'CHECKBOX',
  'PERSON',
  'URL',
])
/** Types a user may create / convert to (the TITLE column is fixed, FR-1410). */
export const dbUserColumnTypeSchema = dbColumnTypeSchema.exclude(['TITLE'])
export const dbViewTypeSchema = z.enum(['TABLE', 'KANBAN', 'CALENDAR'])
export const optionColorSchema = z.enum([
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
])

// ── cells (BR-90) ──

/** string (TEXT/URL/NUMBER/DATE/SELECT) · string[] (MULTI_SELECT/PERSON, ≤ 20) · true (CHECKBOX). */
export const cellValueSchema = z.union([
  z.string().max(L.text, { error: lim.text(L.text) }),
  z.array(z.string().min(1).max(L.idMax)).max(Math.max(L.multi, L.people), { error: lim.multi(L.multi) }),
  z.literal(true),
])
/** updateDatabaseRow `cells`: only sent keys change; `null` clears (M11-D15). ≤ one key per column. */
export const cellsPatchSchema = z
  .record(z.uuid(), cellValueSchema.nullable())
  .refine((r) => Object.keys(r).length <= L.columns, { error: lim.columns(L.columns) })
/** createDatabaseRows `cells` (no null: absent = empty). */
export const cellsInputSchema = z
  .record(z.uuid(), cellValueSchema)
  .refine((r) => Object.keys(r).length <= L.columns, { error: lim.columns(L.columns) })

// ── names / titles ──

const nameSchema = z
  .string()
  .trim()
  .min(1, { error: th.database.errors.emptyName })
  .max(L.name, { error: lim.name(L.name) })
export const dbTitleSchema = z
  .string()
  .trim()
  .max(L.dbTitle, { error: lim.title(L.dbTitle) })
/** Row titles: trimmed, empty allowed (M11-D15). */
export const rowTitleSchema = z
  .string()
  .trim()
  .max(L.rowTitle, { error: lim.title(L.rowTitle) })

// ── column config (FR-1410) ──

export const selectOptionInputSchema = z
  .object({
    /** Optional on input: the server assigns ids to new options (M11-D35). */
    id: z.uuid().optional(),
    name: nameSchema,
    color: optionColorSchema,
  })
  .strict()
export const selectConfigSchema = z
  .object({
    options: z
      .array(selectOptionInputSchema)
      .max(L.optionsPerColumn, { error: lim.options(L.optionsPerColumn) }),
  })
  .strict()
export const numberConfigSchema = z
  .object({
    decimals: z
      .number()
      .int()
      .min(0, { error: lim.decimals(L.decimalsMax) })
      .max(L.decimalsMax, { error: lim.decimals(L.decimalsMax) })
      .nullable(),
    thousands: z.boolean(),
  })
  .strict()
export const emptyConfigSchema = z.object({}).strict()
/** Which branch applies is checked against the column type by the service. */
export const columnConfigSchema = z.union([selectConfigSchema, numberConfigSchema, emptyConfigSchema])

// ── view config (§7.9, BR-94…97, M11-D23) ──

export const FILTER_OPS = [
  'contains',
  'notContains',
  'equals',
  'isEmpty',
  'isNotEmpty',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'isAnyOf',
  'isNoneOf',
  'hasAnyOf',
  'hasAllOf',
  'hasNoneOf',
  'is',
  'before',
  'after',
  'onOrAfter',
  'onOrBefore',
  'checked',
  'unchecked',
  'hasAny',
  'hasNone',
] as const satisfies readonly FilterOp[]

/** The value shape each operator takes (an absent value = an incomplete filter, skipped by the domain). */
export type FilterValueKind = 'none' | 'string' | 'ids' | 'date'
export const FILTER_VALUE_KIND: Readonly<Record<FilterOp, FilterValueKind>> = {
  contains: 'string',
  notContains: 'string',
  equals: 'string',
  isEmpty: 'none',
  isNotEmpty: 'none',
  eq: 'string',
  neq: 'string',
  gt: 'string',
  gte: 'string',
  lt: 'string',
  lte: 'string',
  isAnyOf: 'ids',
  isNoneOf: 'ids',
  hasAnyOf: 'ids',
  hasAllOf: 'ids',
  hasNoneOf: 'ids',
  is: 'date',
  before: 'date',
  after: 'date',
  onOrAfter: 'date',
  onOrBefore: 'date',
  checked: 'none',
  unchecked: 'none',
  hasAny: 'ids',
  hasNone: 'ids',
}

export const dateRefSchema = z.union([
  z.object({ kind: z.literal('date'), date: z.iso.date() }).strict(),
  z.object({ kind: z.literal('today') }).strict(),
])
const filterStringSchema = z.string().max(L.text, { error: lim.text(L.text) })
const filterIdsSchema = z.array(z.string().min(1).max(L.idMax)).max(L.filterValues)

export const viewFilterSchema = z
  .object({
    columnId: z.uuid(),
    op: z.enum(FILTER_OPS),
    value: z.union([filterStringSchema, filterIdsSchema, dateRefSchema]).optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.value === undefined) return
    const kind = FILTER_VALUE_KIND[f.op]
    const ok =
      kind === 'string'
        ? typeof f.value === 'string'
        : kind === 'ids'
          ? Array.isArray(f.value)
          : kind === 'date'
            ? typeof f.value === 'object' && !Array.isArray(f.value)
            : false
    if (!ok) ctx.addIssue({ code: 'custom', path: ['value'], message: th.database.errors.badValue })
  })
export const viewSortSchema = z.object({ columnId: z.uuid(), dir: z.enum(['ASC', 'DESC']) }).strict()

const widthSchema = z
  .number()
  .int()
  .min(L.widthMin, { error: lim.width(L.widthMin, L.widthMax) })
  .max(L.widthMax, { error: lim.width(L.widthMin, L.widthMax) })
const columnIdListSchema = z.array(z.uuid()).max(L.columns, { error: lim.columns(L.columns) })

export const viewConfigSchema = z
  .object({
    hiddenColumnIds: columnIdListSchema.optional(),
    columnWidths: z
      .record(z.uuid(), widthSchema)
      .refine((r) => Object.keys(r).length <= L.columns, { error: lim.columns(L.columns) })
      .optional(),
    sorts: z
      .array(viewSortSchema)
      .max(L.sorts, { error: lim.sorts(L.sorts) })
      .optional(),
    filters: z
      .array(viewFilterSchema)
      .max(L.filters, { error: lim.filters(L.filters) })
      .optional(),
    groupByColumnId: z.uuid().optional(),
    hideEmptyGroups: z.boolean().optional(),
    dateColumnId: z.uuid().optional(),
    cardColumnIds: columnIdListSchema.optional(),
  })
  .strict()

// ── common pieces ──

const baseVersion = z.number().int().positive()
/** `null` = first, omitted = last (M11-D18). */
const afterId = z.uuid().nullable().optional()
export const dbBatchSchema = z.object({ batch: z.uuid() })

// ── actions (§7.9, names verbatim) ──

export const createDatabaseSchema = z.object({ pageId: z.uuid(), view: dbViewTypeSchema })
export const copyDatabaseSchema = z.object({
  sourcePageId: z.uuid(),
  sourceDatabaseId: z.uuid(),
  targetPageId: z.uuid(),
})
export const renameDatabaseSchema = z.object({ databaseId: z.uuid(), baseVersion, title: dbTitleSchema })

export const newRowSchema = z.object({
  title: rowTitleSchema.optional(),
  cells: cellsInputSchema.optional(),
  afterRowId: afterId,
})
export const createDatabaseRowsSchema = z.object({
  databaseId: z.uuid(),
  rows: z
    .array(newRowSchema)
    .min(1)
    .max(L.rowsPerAction, { error: lim.rowsPerAction(L.rowsPerAction) }),
})
export const updateDatabaseRowSchema = z.object({
  rowId: z.uuid(),
  baseVersion,
  title: rowTitleSchema.optional(),
  cells: cellsPatchSchema.optional(),
  move: z.object({ afterRowId: afterId }).optional(),
})
export const deleteDatabaseRowsSchema = z.object({
  rowIds: z
    .array(z.uuid())
    .min(1)
    .max(L.rowIdsPerAction, { error: lim.rows(L.rowIdsPerAction) }),
})
export const restoreDatabaseRowBatchSchema = dbBatchSchema

export const createDatabaseColumnSchema = z.object({
  databaseId: z.uuid(),
  type: dbUserColumnTypeSchema,
  name: nameSchema.optional(),
  afterColumnId: afterId,
})
export const updateDatabaseColumnSchema = z.object({
  columnId: z.uuid(),
  baseVersion,
  name: nameSchema.optional(),
  config: columnConfigSchema.optional(),
  afterColumnId: afterId,
})
export const duplicateDatabaseColumnSchema = z.object({ columnId: z.uuid() })
export const changeDatabaseColumnTypeSchema = z.object({
  columnId: z.uuid(),
  baseVersion,
  type: dbUserColumnTypeSchema,
})
/** M11-D16: the server re-validates every value against `previous.type` / `previous.config`. */
export const revertDatabaseColumnTypeSchema = z.object({
  columnId: z.uuid(),
  previous: z.object({
    type: dbColumnTypeSchema,
    config: columnConfigSchema,
    columnVersion: z.number().int().positive(),
    values: z.record(z.uuid(), cellValueSchema),
  }),
})
export const deleteDatabaseColumnSchema = z.object({ columnId: z.uuid() })
export const restoreDatabaseColumnBatchSchema = dbBatchSchema

export const createDatabaseViewSchema = z.object({
  databaseId: z.uuid(),
  type: dbViewTypeSchema,
  name: nameSchema.optional(),
  copyFromViewId: z.uuid().optional(),
})
export const updateDatabaseViewSchema = z.object({
  viewId: z.uuid(),
  baseVersion,
  name: nameSchema.optional(),
  config: viewConfigSchema.optional(),
  afterViewId: afterId,
})
export const deleteDatabaseViewSchema = z.object({ viewId: z.uuid() })
export const restoreDatabaseViewBatchSchema = dbBatchSchema

/** Route params of `GET /api/pages/[id]/databases/[databaseId]` (malformed → 404, X86, M11-D7). */
export const databaseParamsSchema = z.object({ id: z.uuid(), databaseId: z.uuid() })

export type CreateDatabaseInput = z.output<typeof createDatabaseSchema>
export type CopyDatabaseInput = z.output<typeof copyDatabaseSchema>
export type RenameDatabaseInput = z.output<typeof renameDatabaseSchema>
export type CreateDatabaseRowsInput = z.output<typeof createDatabaseRowsSchema>
export type UpdateDatabaseRowInput = z.output<typeof updateDatabaseRowSchema>
export type DeleteDatabaseRowsInput = z.output<typeof deleteDatabaseRowsSchema>
export type CreateDatabaseColumnInput = z.output<typeof createDatabaseColumnSchema>
export type UpdateDatabaseColumnInput = z.output<typeof updateDatabaseColumnSchema>
export type ChangeDatabaseColumnTypeInput = z.output<typeof changeDatabaseColumnTypeSchema>
export type RevertDatabaseColumnTypeInput = z.output<typeof revertDatabaseColumnTypeSchema>
export type CreateDatabaseViewInput = z.output<typeof createDatabaseViewSchema>
export type UpdateDatabaseViewInput = z.output<typeof updateDatabaseViewSchema>
export type ColumnConfigInput = z.output<typeof columnConfigSchema>
export type ViewConfigInput = z.output<typeof viewConfigSchema>
