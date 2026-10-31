// src/server/services/files.ts — uploads and downloads (SPEC §7.6, FILE-1…8, M4-D15/D16/D17).
// storeUpload never audits (POST /api/files does, X96/M4-D38). Bytes are written (temp + rename) before the files
// insert; any failure after the write removes them best-effort (M4-D16).
import type { ISODate } from '@/domain/types'
import type { UploadedFileDTO } from '@/lib/contracts/files'
import { fileUrl, type UploadLimits } from '@/lib/files/upload-rules'
import * as authz from '../authz'
import type { PageAccess } from '../authz'
import type { DbOrTx, Tx } from '../db/types'
import { NotFoundError, PayloadTooLargeError, UnsupportedMediaTypeError } from '../errors'
import { classifyUpload } from '../files/classify-upload'
import * as filesRepo from '../repo/files'
import type { SessionUser } from '../session'
import { getStorage, newStorageKey } from '../storage'

/** Classify by magic bytes, write to storage before the insert, remove on failure (M4-D16). `onStored` lets the
 *  caller remove the bytes when a later step of its transaction (audit, commit) fails. */
export async function storeUpload(
  tx: Tx,
  user: SessionUser,
  a: PageAccess,
  i: {
    name: string
    bytes: Uint8Array
    purpose: 'content' | 'cover'
    limits: UploadLimits
    today: ISODate
    onStored?: (key: string) => void
  },
): Promise<UploadedFileDTO> {
  const cls = await classifyUpload(i.bytes, i.name, i.limits)
  if (!cls.ok) throw cls.code === 'TOO_LARGE' ? new PayloadTooLargeError() : new UnsupportedMediaTypeError()
  if (i.purpose === 'cover' && cls.kind !== 'IMAGE') throw new UnsupportedMediaTypeError()
  const key = newStorageKey(i.today, cls.ext)
  const storage = getStorage()
  await storage.put(key, i.bytes)
  try {
    i.onStored?.(key)
    const row = await filesRepo.insertFile(tx, {
      storageKey: key,
      originalName: sanitizeFileName(i.name),
      mime: cls.mime,
      sizeBytes: i.bytes.length,
      kind: cls.kind,
      pageId: a.page.id,
      projectId: a.page.projectId,
      uploadedBy: user.id,
    })
    return {
      id: row.id,
      url: fileUrl(row.id),
      name: row.originalName,
      size: row.sizeBytes,
      kind: row.kind,
      mime: row.mime,
    }
  } catch (e) {
    await removeBestEffort(key)
    throw e
  }
}

/** Unlinks a stored key, logging (key only) instead of throwing. */
export async function removeBestEffort(key: string): Promise<void> {
  try {
    await getStorage().remove(key)
  } catch {
    console.warn('[files] could not remove stored file', { key })
  }
}

/** authz.requireFile, then a streamed Response with nosniff, CSP sandbox and Content-Disposition (§7.6). */
export async function openDownload(tx: DbOrTx, user: SessionUser, fileId: string): Promise<Response> {
  const { file } = await authz.requireFile(tx, user, fileId) // invisible project → 404 (AC-503)
  const stored = await getStorage().stream(file.storageKey)
  if (!stored) throw new NotFoundError()
  const headers = new Headers({
    'Content-Type': file.mime,
    'Content-Length': String(stored.size),
    'X-Content-Type-Options': 'nosniff',
  })
  if (file.kind === 'IMAGE') {
    headers.set('Content-Disposition', contentDisposition('inline', file.originalName))
    headers.set('Cache-Control', 'private, max-age=3600')
  } else {
    headers.set('Content-Disposition', contentDisposition('attachment', file.originalName))
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox")
    headers.set('Cache-Control', 'private, no-store')
  }
  return new Response(stored.body, { status: 200, headers })
}

/** RFC 5987 value: encodeURIComponent plus the characters it leaves that attr-char forbids. */
const rfc5987 = (s: string): string =>
  encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/** RFC 6266/5987 header (ASCII fallback + filename*=UTF-8''…). */
export function contentDisposition(kind: 'inline' | 'attachment', name: string): string {
  const fallback = name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'file'
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${rfc5987(name)}`
}

const NAME_MAX = 200
// Path separators, Windows-reserved characters, C0/C1 controls (and DEL).
const UNSAFE_NAME_CHARS = /[/\\:*?"<>|\u0000-\u001f\u007f-\u009f]/g

/** No path separators / control characters, ≤ 200 chars keeping the extension, empty → 'file' (M4-D28). */
export function sanitizeFileName(name: string): string {
  const clean = name.normalize('NFC').replace(UNSAFE_NAME_CHARS, '').replace(/\s+/g, ' ').trim()
  if (clean === '' || /^\.+$/.test(clean)) return 'file'
  const chars = [...clean]
  if (chars.length <= NAME_MAX) return clean
  const dot = clean.lastIndexOf('.')
  const ext = dot > 0 ? [...clean.slice(dot)] : []
  if (ext.length === 0 || ext.length > 16) return chars.slice(0, NAME_MAX).join('')
  const stem = [...clean.slice(0, dot)]
  return stem.slice(0, NAME_MAX - ext.length).join('') + ext.join('')
}
