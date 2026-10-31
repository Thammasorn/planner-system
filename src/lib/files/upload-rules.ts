// src/lib/files/upload-rules.ts — isomorphic upload rules (SPEC §7.6, M4-D15). The client pre-check gives instant
// feedback; the server (POST /api/files, magic bytes via file-type) is the authority.
// Logic from plan/research/snippets/r3/harness/src/lib/upload.ts#classifyFile with error keys instead of strings.

export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export const ATTACHMENT_EXT = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'csv',
  'txt',
  'zip',
  'svg',
] as const

export interface UploadLimits {
  imageBytes: number
  attachmentBytes: number
}

export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  imageBytes: 10 * 1024 * 1024,
  attachmentBytes: 25 * 1024 * 1024,
}

/** A same-origin file URL as stored in image/file blocks (M4-D9). */
export const FILE_URL_RE = /^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const fileUrl = (id: string): string => `/api/files/${id}`

export type ClientFileClass =
  { kind: 'IMAGE' | 'ATTACHMENT' } | { error: 'tooLargeImage' | 'tooLargeFile' | 'typeNotAllowed' }

/** Lower-cased extension after the last dot ('' when none). */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** Client pre-check: raster image MIME → IMAGE; allowed extension → ATTACHMENT (SVG is never an IMAGE). */
export function precheckFile(
  f: { name: string; type: string; size: number },
  limits: UploadLimits,
): ClientFileClass {
  if ((IMAGE_MIME as readonly string[]).includes(f.type)) {
    return f.size <= limits.imageBytes ? { kind: 'IMAGE' } : { error: 'tooLargeImage' }
  }
  if ((ATTACHMENT_EXT as readonly string[]).includes(fileExtension(f.name))) {
    return f.size <= limits.attachmentBytes ? { kind: 'ATTACHMENT' } : { error: 'tooLargeFile' }
  }
  return { error: 'typeNotAllowed' }
}
