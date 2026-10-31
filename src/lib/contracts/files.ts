// src/lib/contracts/files.ts — isomorphic upload DTO (`POST /api/files` 201 body, §7.6).

export interface UploadedFileDTO {
  id: string
  /** Relative: /api/files/<id>. */
  url: string
  name: string
  size: number
  kind: 'IMAGE' | 'ATTACHMENT'
  /** Detected from magic bytes. */
  mime: string
}
