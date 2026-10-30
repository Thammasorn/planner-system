// src/server/files/classify-upload.ts — SPEC §7.6: decide by magic bytes, never by the client Content-Type.
import { fileTypeFromBuffer } from 'file-type'

export type UploadClass =
  | { ok: true; kind: 'image' | 'attachment'; ext: string; mime: string }
  | { ok: false; code: 'UNSUPPORTED_TYPE' | 'TOO_LARGE' }

const MB = 1024 * 1024
const LIMIT = { image: 10 * MB, attachment: 25 * MB } as const
const IMAGE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
const BINARY_ATTACHMENT: Record<string, string> = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
// file-type reports every OLE2/CFB container as { ext: 'cfb' } — trust the client extension only inside that family.
const LEGACY_OFFICE: Record<string, string> = { doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint' }
// No magic bytes: accept only as UTF-8 text. Served as attachment + nosniff.
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
const sized = (kind: 'image' | 'attachment', ext: string, mime: string, size: number): UploadClass =>
  size > LIMIT[kind] ? { ok: false, code: 'TOO_LARGE' } : { ok: true, kind, ext, mime }

export async function classifyUpload(bytes: Uint8Array, clientName: string): Promise<UploadClass> {
  const claimed = extOf(clientName)
  const detected = await fileTypeFromBuffer(bytes) // full buffer: OOXML detection may need more than 4100 bytes
  if (detected) {
    const imageMime = IMAGE[detected.ext]
    if (imageMime) return sized('image', detected.ext, imageMime, bytes.length)
    const binMime = BINARY_ATTACHMENT[detected.ext]
    if (detected.ext === 'zip' && ['docx', 'xlsx', 'pptx'].includes(claimed)) {
      return sized('attachment', claimed, BINARY_ATTACHMENT[claimed] ?? 'application/zip', bytes.length) // OOXML not recognised by content
    }
    if (binMime) return sized('attachment', detected.ext, binMime, bytes.length)
    const legacy = LEGACY_OFFICE[claimed]
    if (detected.ext === 'cfb' && legacy) return sized('attachment', claimed, legacy, bytes.length)
    if (detected.ext === 'xml' && claimed === 'svg' && isUtf8Text(bytes)) return sized('attachment', 'svg', TEXT.svg ?? '', bytes.length)
    return { ok: false, code: 'UNSUPPORTED_TYPE' }
  }
  const textMime = TEXT[claimed]
  // csv/txt: any encoding (Thai Excel exports Windows-874) as long as it looks like text; svg must be UTF-8.
  const looksText = claimed === 'svg' ? isUtf8Text(bytes) : !bytes.subarray(0, 65536).includes(0)
  if (textMime && looksText) {
    if (claimed === 'svg' && !new TextDecoder().decode(bytes.subarray(0, 2048)).includes('<svg')) return { ok: false, code: 'UNSUPPORTED_TYPE' }
    return sized('attachment', claimed, textMime, bytes.length)
  }
  return { ok: false, code: 'UNSUPPORTED_TYPE' }
}
