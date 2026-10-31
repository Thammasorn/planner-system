// src/server/files/classify-upload.ts — SPEC §7.6 (FILE-3…5, M4-D15): decide by magic bytes, never by the client
// Content-Type. Copied from plan/research/snippets/r4/server/classify-upload.ts; the fixed LIMIT became the
// `limits` parameter (env MAX_IMAGE_MB / MAX_ATTACHMENT_MB) and `kind` maps to the files.kind values.
import { fileTypeFromBuffer } from 'file-type'
import type { UploadLimits } from '@/lib/files/upload-rules'

export type UploadClass =
  | { ok: true; kind: 'IMAGE' | 'ATTACHMENT'; ext: string; mime: string }
  | { ok: false; code: 'UNSUPPORTED_TYPE' | 'TOO_LARGE' }

const IMAGE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}
const BINARY_ATTACHMENT: Record<string, string> = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
// file-type reports every OLE2/CFB container as { ext: 'cfb' } — trust the client extension only inside that family.
const LEGACY_OFFICE: Record<string, string> = {
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
}
// No magic bytes: accept only as text. Served as attachment + nosniff (SVG is never an IMAGE).
const TEXT: Record<string, string> = { csv: 'text/csv', txt: 'text/plain', svg: 'image/svg+xml' }

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

function isUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

function sized(kind: 'IMAGE' | 'ATTACHMENT', ext: string, mime: string, size: number, limits: UploadLimits): UploadClass {
  const max = kind === 'IMAGE' ? limits.imageBytes : limits.attachmentBytes
  return size > max ? { ok: false, code: 'TOO_LARGE' } : { ok: true, kind, ext, mime }
}

export async function classifyUpload(
  bytes: Uint8Array,
  clientName: string,
  limits: UploadLimits,
): Promise<UploadClass> {
  if (bytes.length === 0) return { ok: false, code: 'UNSUPPORTED_TYPE' }
  const claimed = extOf(clientName)
  const detected = await fileTypeFromBuffer(bytes) // full buffer: OOXML detection may need more than 4100 bytes
  if (detected) {
    const imageMime = IMAGE[detected.ext]
    if (imageMime) return sized('IMAGE', detected.ext, imageMime, bytes.length, limits)
    if (detected.ext === 'zip' && ['docx', 'xlsx', 'pptx'].includes(claimed)) {
      // OOXML that file-type did not recognise by content
      return sized('ATTACHMENT', claimed, BINARY_ATTACHMENT[claimed] ?? 'application/zip', bytes.length, limits)
    }
    const binMime = BINARY_ATTACHMENT[detected.ext]
    if (binMime) return sized('ATTACHMENT', detected.ext, binMime, bytes.length, limits)
    const legacy = LEGACY_OFFICE[claimed]
    if (detected.ext === 'cfb' && legacy) return sized('ATTACHMENT', claimed, legacy, bytes.length, limits)
    if (detected.ext === 'xml' && claimed === 'svg' && isUtf8Text(bytes)) {
      return sized('ATTACHMENT', 'svg', 'image/svg+xml', bytes.length, limits)
    }
    return { ok: false, code: 'UNSUPPORTED_TYPE' }
  }
  const textMime = TEXT[claimed]
  // csv/txt: any encoding (Thai Excel exports Windows-874) as long as it looks like text; svg must be UTF-8.
  const looksText = claimed === 'svg' ? isUtf8Text(bytes) : !bytes.subarray(0, 65536).includes(0)
  if (textMime && looksText) {
    if (claimed === 'svg' && !new TextDecoder().decode(bytes.subarray(0, 2048)).includes('<svg')) {
      return { ok: false, code: 'UNSUPPORTED_TYPE' }
    }
    return sized('ATTACHMENT', claimed, textMime, bytes.length, limits)
  }
  return { ok: false, code: 'UNSUPPORTED_TYPE' }
}
