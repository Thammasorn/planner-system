// src/lib/schemas/pages.ts — page inputs shared by actions, routes and client forms (plan/m04 S0.8, Zod 4).
// Ids are z.uuid() (X47); messages come from th.
import { th } from '@/i18n/th'
import { PAGE_ICONS } from '@/lib/pages/icons'
import { z } from '@/lib/z'
import { pageContentSchema } from './page-content'

export const PAGE_TITLE_MAX = 200 // M4-D28

export const pageSpaceSchema = z.enum(['WORKSPACE', 'PROJECT'])
export const pageTitleSchema = z.string().trim().max(PAGE_TITLE_MAX, { error: th.pages.errors.titleTooLong })
export const pageIdSchema = z.object({ pageId: z.uuid() })

export const createPageSchema = z
  .object({
    space: pageSpaceSchema,
    projectId: z.uuid().nullable(),
    parentId: z.uuid().nullable(),
    /** undefined = append last; null = first (intent, never order keys — X58). */
    afterId: z.uuid().nullable().optional(),
  })
  .refine((v) => (v.space === 'PROJECT') === (v.projectId !== null), {
    error: th.pages.errors.crossSpace,
    path: ['projectId'],
  })

export const renamePageSchema = z.object({ pageId: z.uuid(), title: pageTitleSchema })
export const setPageIconSchema = z.object({ pageId: z.uuid(), icon: z.enum(PAGE_ICONS).nullable() })
export const setPageCoverSchema = z.object({ pageId: z.uuid(), fileId: z.uuid().nullable() })
export const movePageSchema = z.object({
  pageId: z.uuid(),
  parentId: z.uuid().nullable(),
  afterId: z.uuid().nullable(),
})
export const restorePageBatchSchema = z.object({ batch: z.uuid() })
export const setPageProtectedSchema = z.object({ pageId: z.uuid(), protected: z.boolean() })
/** FR-1602 / M6.1-D15 / M11-D8: exactly one of pageId (DOC page), taskId (task body, created when missing) or rowId
 *  (database row body, created when missing). */
export const setPageFullWidthSchema = z
  .object({
    pageId: z.uuid().optional(),
    taskId: z.uuid().optional(),
    rowId: z.uuid().optional(),
    fullWidth: z.boolean(),
  })
  .refine((v) => [v.pageId, v.taskId, v.rowId].filter((id) => id !== undefined).length === 1, {
    path: ['pageId'],
  })

export const templateIdSchema = z.enum(['charter', 'meeting', 'sop'])
export const applyTemplateSchema = z.object({
  pageId: z.uuid(),
  baseVersion: z.number().int().min(1),
  template: templateIdSchema,
})

export const savePageContentSchema = z.object({
  pageId: z.uuid(),
  baseVersion: z.number().int().min(1),
  content: pageContentSchema,
})
/** Body of the keepalive `PUT /api/pages/[id]/content` (M4-D2); the page id comes from the route param. */
export const keepaliveSaveBodySchema = savePageContentSchema.omit({ pageId: true })

/** `GET /api/pages/tree?space=&projectId=&parentId=` (lazy children per node, M4-D23). */
export const treeQuerySchema = z
  .object({ space: pageSpaceSchema, projectId: z.uuid().optional(), parentId: z.uuid().optional() })
  .refine((v) => (v.space === 'PROJECT') === (v.projectId !== undefined), { path: ['projectId'] })

/** `GET /api/pages/titles?ids=a,b` — 1…100 ids. */
export const titlesQuerySchema = z.object({
  ids: z
    .string()
    .max(3800)
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(z.uuid()).min(1).max(100)),
})

export const leaseQuerySchema = z.object({ takeover: z.literal('1').optional() })
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  titleOnly: z.literal('1').optional(),
})
/** Multipart fields of `POST /api/files` (besides the `file` part). */
export const uploadFieldsSchema = z.object({
  pageId: z.uuid(),
  purpose: z.enum(['content', 'cover']).default('content'),
})

export type CreatePageInput = z.output<typeof createPageSchema>
export type MovePageInput = z.output<typeof movePageSchema>
export type TreeQuery = z.output<typeof treeQuerySchema>
