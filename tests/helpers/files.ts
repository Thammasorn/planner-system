// tests/helpers/files.ts — byte fixtures for upload tests + the `POST /api/files` request builder (plan/m04 S0.15).
// Route handlers are called with tests/authz/_support/http.ts#callRoute (M2); this file adds only the multipart
// request. Every fixture is tiny and built in memory (no binary files in the repo).

const b64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'))
const ascii = (s: string): Uint8Array => new TextEncoder().encode(s)

/** A valid 1×1 RGBA PNG (CRCs and IDAT checked) — browsers must decode it (e2e E4 clipboard, naturalWidth). */
export const PNG_1X1: Uint8Array = b64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
)

/** Minimal JFIF header + EOI (detected as jpg). */
export function jpegBytes(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00,
    0x01, 0x00, 0x00, 0xff, 0xd9,
  ])
}

/** 1×1 GIF89a. */
export function gifBytes(): Uint8Array {
  return b64('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==')
}

/** 1×1 lossy WebP (RIFF….WEBPVP8 ). */
export function webpBytes(): Uint8Array {
  return b64('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA')
}

/** Minimal PDF (%PDF-1.4 … %%EOF). */
export function pdfBytes(): Uint8Array {
  return ascii('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n')
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A stored (uncompressed) ZIP archive with one file. */
export function zipOneFile(name: string, text: string): Uint8Array {
  const nameBytes = ascii(name)
  const data = new TextEncoder().encode(text)
  const crc = crc32(data)
  const local = new DataView(new ArrayBuffer(30))
  local.setUint32(0, 0x04034b50, true) // local file header
  local.setUint16(4, 20, true) // version needed
  local.setUint16(6, 0, true) // flags
  local.setUint16(8, 0, true) // method: stored
  local.setUint32(14, crc, true)
  local.setUint32(18, data.length, true)
  local.setUint32(22, data.length, true)
  local.setUint16(26, nameBytes.length, true)
  const central = new DataView(new ArrayBuffer(46))
  central.setUint32(0, 0x02014b50, true) // central directory header
  central.setUint16(4, 20, true) // version made by
  central.setUint16(6, 20, true) // version needed
  central.setUint32(16, crc, true)
  central.setUint32(20, data.length, true)
  central.setUint32(24, data.length, true)
  central.setUint16(28, nameBytes.length, true)
  central.setUint32(42, 0, true) // offset of the local header
  const localSize = 30 + nameBytes.length + data.length
  const centralSize = 46 + nameBytes.length
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true) // end of central directory
  end.setUint16(8, 1, true)
  end.setUint16(10, 1, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, localSize, true)
  return concat([
    new Uint8Array(local.buffer),
    nameBytes,
    data,
    new Uint8Array(central.buffer),
    nameBytes,
    new Uint8Array(end.buffer),
  ])
}

/** OLE2 / Compound File header padded to 1 536 bytes (legacy .doc/.xls/.ppt detect as 'cfb'). */
export function cfbBytes(): Uint8Array {
  const out = new Uint8Array(1536)
  out.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  return out
}

/** 'MZ' + zeros (Windows executable). */
export function exeBytes(): Uint8Array {
  const out = new Uint8Array(128)
  out.set([0x4d, 0x5a])
  return out
}

export const SVG_TEXT = '<svg xmlns="http://www.w3.org/2000/svg"/>'
export const XML_SVG_TEXT = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'

/** "วัน,1\n" in Windows-874 (Thai Excel CSV). */
export function thaiCsvWin874(): Uint8Array {
  return new Uint8Array([0xc7, 0xd1, 0xb9, 0x2c, 0x31, 0x0a])
}

/** PNG_1X1 followed by zero bytes up to `totalBytes` (size-limit tests). */
export function paddedPng(totalBytes: number): Uint8Array {
  const out = new Uint8Array(Math.max(totalBytes, PNG_1X1.length))
  out.set(PNG_1X1)
  return out
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export interface UploadRequestOptions {
  pageId: string
  name: string
  bytes: Uint8Array
  /** Client-claimed MIME type (never trusted by the server). Default application/octet-stream. */
  type?: string
  purpose?: 'content' | 'cover'
  /** Origin header (M4-D18 same-origin check); omitted when undefined. */
  origin?: string
  /** Overrides the computed Content-Length (length-mismatch tests). */
  contentLength?: number
}

/**
 * `POST http://localhost/api/files` with a multipart body (`pageId`, `purpose`, `file`) and an explicit
 * Content-Length, as a browser sends it. Async because the multipart body is serialised first.
 */
export async function uploadRequest(o: UploadRequestOptions): Promise<Request> {
  const fd = new FormData()
  fd.set('pageId', o.pageId)
  if (o.purpose) fd.set('purpose', o.purpose)
  fd.set('file', new File([o.bytes.slice()], o.name, { type: o.type ?? 'application/octet-stream' }))
  const encoded = new Response(fd)
  const body = new Uint8Array(await encoded.arrayBuffer())
  const headers = new Headers({
    'content-type': encoded.headers.get('content-type') ?? 'multipart/form-data',
    'content-length': String(o.contentLength ?? body.byteLength),
  })
  if (o.origin !== undefined) headers.set('origin', o.origin)
  return new Request('http://localhost/api/files', { method: 'POST', body, headers })
}
