// src/lib/editor/upload.ts — editor uploads (FR-525/527, SPEC §7.6, M4-D15, r3 §8.2). Client module.
// From plan/research/snippets/r3/harness/src/lib/upload.ts. The client pre-check is instant feedback only; the
// server (POST /api/files, magic bytes) is the authority and decides the final block type (image vs attachment).
import type { AppEditor, AppPartialBlock } from '@/components/editor/schema'
import { th } from '@/i18n/th'
import type { UploadedFileDTO } from '@/lib/contracts/files'
import { type ClientFileClass, precheckFile, type UploadLimits } from '@/lib/files/upload-rules'

export type Notify = (message: string) => void

const MIB = 1024 * 1024
const mb = (bytes: number): number => Math.round((bytes / MIB) * 10) / 10

/** Thai message of a failed client pre-check. */
export function precheckMessage(
  error: Extract<ClientFileClass, { error: string }>['error'],
  limits: UploadLimits,
): string {
  const t = th.editor.upload
  if (error === 'tooLargeImage') return t.tooLargeImage(mb(limits.imageBytes))
  if (error === 'tooLargeFile') return t.tooLargeFile(mb(limits.attachmentBytes))
  return t.typeNotAllowed
}

/**
 * Upload-in-progress store keyed by block id, read with useSyncExternalStore by the attachment block. BlockNote's
 * `useUploadLoading` subscribes in an effect and misses the start event of a block mounted in the same tick (r3 G10).
 */
const uploading = new Set<string>()
const listeners = new Set<() => void>()
export const uploadStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  has: (blockId: string): boolean => uploading.has(blockId),
  set: (blockId: string | undefined, on: boolean): void => {
    if (!blockId) return
    if (on) uploading.add(blockId)
    else uploading.delete(blockId)
    listeners.forEach((l) => l())
  },
}

/** The live editor of a page, for the failure cleanup of `uploadFile` (which BlockNote calls without the editor).
 *  PageEditor registers it in an effect under its stable editor key (M6.1-D8: DOC = page id, TASK = 'task:<id>', so
 *  a task body without a page row yet is registered too); the returned function unregisters it. */
const editors = new Map<string, AppEditor>()
export function registerUploadEditor(key: string, editor: AppEditor): () => void {
  editors.set(key, editor)
  return () => {
    if (editors.get(key) === editor) editors.delete(key)
  }
}

/** What `uploadFile` resolves to: a PartialBlock update (BlockNote calls `updateBlock(blockId, result)`), or `{}`
 *  (no-op) after a failure. */
export type UploadResult = AppPartialBlock | Record<string, never>

/**
 * BlockNote `uploadFile` option. NEVER rejects: BlockNote's drop path (`void handleFileInsertion(...)`) has no catch,
 * so a rejection would be an unhandled promise rejection (r3 G9). On failure: toast, resolve `{}` and remove the
 * empty placeholder on the next tick — only when its url is still '' (never an existing image on a failed replace).
 */
export function makeUploadFile(o: {
  /** The page the file belongs to (DOC pages and existing task bodies). */
  pageId?: string
  /** M6.1-D8: resolves the page id, creating a task body's row first (ensureTaskBody, memoised). Wins over pageId. */
  getPageId?: () => Promise<string>
  /** Key the editor was registered under (registerUploadEditor); defaults to pageId. */
  editorKey?: string
  notify: Notify
  limits: UploadLimits
  /** Defaults to the editor registered under editorKey / pageId (registerUploadEditor). */
  getEditor?: () => AppEditor | null | undefined
}): (file: File, blockId?: string) => Promise<UploadResult> {
  const getEditor = o.getEditor ?? (() => editors.get(o.editorKey ?? o.pageId ?? ''))
  const resolvePageId = o.getPageId ?? (() => Promise.resolve(o.pageId ?? ''))
  const fail = (message: string, blockId?: string): Record<string, never> => {
    o.notify(message)
    setTimeout(() => {
      const editor = getEditor()
      if (!editor || !blockId) return
      const b = editor.getBlock(blockId)
      if (b && 'url' in b.props && b.props.url === '') editor.removeBlocks([b.id])
    }, 0)
    return {}
  }

  async function doUpload(file: File, blockId?: string): Promise<UploadResult> {
    const cls = precheckFile(file, o.limits)
    if ('error' in cls) return fail(precheckMessage(cls.error, o.limits), blockId)
    let pageId: string
    try {
      pageId = await resolvePageId() // a task body's first upload creates the row (FR-681)
    } catch {
      return fail(th.editor.upload.failed, blockId)
    }
    if (pageId === '') return fail(th.editor.upload.failed, blockId)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('pageId', pageId)
    let res: Response
    try {
      res = await fetch('/api/files', { method: 'POST', body: fd })
    } catch {
      return fail(th.editor.upload.failed, blockId)
    }
    if (res.status === 413)
      return fail(
        cls.kind === 'IMAGE'
          ? precheckMessage('tooLargeImage', o.limits)
          : precheckMessage('tooLargeFile', o.limits),
        blockId,
      )
    if (res.status === 415) return fail(th.editor.upload.typeNotAllowed, blockId)
    if (!res.ok) return fail(th.editor.upload.failed, blockId)
    let r: UploadedFileDTO
    try {
      r = (await res.json()) as UploadedFileDTO
    } catch {
      return fail(th.editor.upload.failed, blockId)
    }
    // The server decides the kind (magic bytes): SVG or a fake ".png" becomes an attachment.
    if (r.kind === 'IMAGE') return { type: 'image', props: { url: r.url, name: r.name } }
    return { type: 'file', props: { url: r.url, name: r.name, size: r.size } }
  }

  return async (file, blockId) => {
    uploadStore.set(blockId, true)
    try {
      return await doUpload(file, blockId)
    } catch {
      return fail(th.editor.upload.failed, blockId)
    } finally {
      uploadStore.set(blockId, false)
    }
  }
}

/**
 * File insertion for paste (we control routing, limits and order): each accepted file gets a placeholder block
 * (replacing the current block when it is an empty text block, else right after the previous one), then
 * `editor.uploadFile` (never rejects) and the result is applied. Rejected files only toast.
 */
export async function insertFilesAtCursor(
  editor: AppEditor,
  files: readonly File[],
  notify: Notify,
  limits: UploadLimits,
): Promise<void> {
  let ref: AppBlock = editor.getTextCursorPosition().block
  for (const file of files) {
    const cls = precheckFile(file, limits)
    if ('error' in cls) {
      notify(precheckMessage(cls.error, limits))
      continue
    }
    const placeholder: AppPartialBlock =
      cls.kind === 'IMAGE'
        ? { type: 'image', props: { name: file.name } }
        : { type: 'file', props: { name: file.name } }
    const isEmptyTextBlock = Array.isArray(ref.content) && ref.content.length === 0
    const inserted: AppBlock | undefined = isEmptyTextBlock
      ? editor.updateBlock(ref, placeholder)
      : editor.insertBlocks([placeholder], ref, 'after')[0]
    if (!inserted) continue
    ref = inserted
    if (!editor.uploadFile) return
    const data = await editor.uploadFile(file, inserted.id)
    if (!editor.getBlock(inserted.id)) continue // removed meanwhile (user or failure cleanup)
    if (typeof data === 'string') editor.updateBlock(inserted.id, { props: { url: data } })
    else if (Object.keys(data).length > 0) editor.updateBlock(inserted.id, data as AppPartialBlock)
  }
}

type AppBlock = AppEditor['document'][number]
