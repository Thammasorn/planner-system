// Uploads and downloads — PERM-16 (project files), PERM-17/18 (wiki files), FILE-1…7, AC-503 (SPEC §3.2, §7.6;
// plan/m04-pages-editor.md §7.2 keys FL-*), written from SPEC before S1's bodies exist.
// POST /api/files order (S1.7): assertSameOrigin → coarse Content-Length cap → form parse → requirePage(edit) →
// classify, so a forbidden type is 415 for members but still 404 for the outsider (authz first).
// GET /api/files/[id] is authorised by files.project_id only (M4-D17): null → any user; else requireProject(view).
import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import type { UploadedFileDTO } from '@/lib/contracts/files'
import { FILE_URL_RE } from '@/lib/files/upload-rules'
import { makeFile, makePage } from '../../helpers/factories'
import { exeBytes, paddedPng, pdfBytes, PNG_1X1 } from '../../helpers/files'
import { defineRow, type AuthzRow } from '../types'
import {
  ALL,
  ARCH_WRITE,
  auditFileA,
  auditFileP,
  auditFileWiki,
  each,
  FOREIGN_ORIGIN,
  fileGet,
  MGR,
  PAGES,
  PROJ,
  upload,
} from './_m4'

/** 11 MiB — above MAX_IMAGE_MB (default 10), below the attachment cap (25), so the coarse length check passes. */
const ELEVEN_MB = 11 * 1024 * 1024

/** A 201 upload answers an UploadedFileDTO whose url is /api/files/<uuid> (FILE-1). */
async function checkedUpload(res: Response, kind: UploadedFileDTO['kind']): Promise<Response> {
  if (res.status === 201) {
    const body = (await res.clone().json()) as UploadedFileDTO
    expect(body.url).toMatch(FILE_URL_RE)
    expect(body.kind).toBe(kind)
  }
  return res
}

/** §7.6 headers on a 200 download: nosniff always; images inline + private, max-age=3600; attachments attachment. */
function checkedDownload(res: Response, kind: 'IMAGE' | 'ATTACHMENT'): Response {
  if (res.status === 200) {
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    const disposition = res.headers.get('content-disposition') ?? ''
    if (kind === 'IMAGE') {
      expect(disposition).toMatch(/^inline/)
      expect(res.headers.get('cache-control')).toBe('private, max-age=3600')
    } else {
      expect(disposition).toMatch(/^attachment/)
    }
  }
  return res
}

export const rows: AuthzRow[] = [
  // ── uploads ──────────────────────────────────────────────────────────────────────────────────────────────────
  defineRow({
    id: 'FL-UPLOAD-P',
    spec: 'PERM-16 + FILE-1 — POST /api/files on pPage (PNG) → 201',
    action: 'POST /api/files',
    mutates: true,
    audit: auditFileP,
    with: PAGES,
    expect: PROJ,
    run: async (w) =>
      checkedUpload(await upload({ pageId: w.pages.pPage.id, name: 'a.png', bytes: PNG_1X1 }), 'IMAGE'),
  }),
  defineRow({
    id: 'FL-UPLOAD-ARCH',
    spec: 'PERM-16 + X42 — upload to a page of archived A',
    action: 'POST /api/files',
    mutates: true,
    audit: auditFileA,
    with: PAGES,
    expect: ARCH_WRITE,
    run: (w) => upload({ pageId: w.pages.aPage.id, name: 'a.png', bytes: PNG_1X1 }),
  }),
  defineRow({
    id: 'FL-UPLOAD-WIKI',
    spec: 'PERM-18 — upload to the wiki page (project_id null)',
    action: 'POST /api/files',
    mutates: true,
    audit: auditFileWiki,
    with: PAGES,
    expect: ALL,
    run: async (w) =>
      checkedUpload(await upload({ pageId: w.pages.wiki.id, name: 'a.png', bytes: PNG_1X1 }), 'IMAGE'),
  }),
  defineRow({
    id: 'FL-UPLOAD-PROT',
    spec: 'PERM-18 — upload to a protected wiki page: manager only',
    action: 'POST /api/files',
    mutates: true,
    audit: auditFileWiki,
    with: PAGES,
    expect: MGR,
    run: (w) => upload({ pageId: w.pages.wikiProtected.id, name: 'a.png', bytes: PNG_1X1 }),
  }),
  defineRow({
    id: 'FL-UPLOAD-ORIGIN',
    spec: 'PERM-16 + M4-D18 — a foreign Origin header is refused before authz (403 for everyone)',
    action: 'POST /api/files',
    mutates: true,
    audit: auditFileP,
    with: PAGES,
    expect: each('403'),
    run: (w) => upload({ pageId: w.pages.pPage.id, name: 'a.png', bytes: PNG_1X1, origin: FOREIGN_ORIGIN }),
  }),
  defineRow({
    id: 'FL-UPLOAD-EXE',
    spec: 'PERM-16 + FILE-5 — an executable named a.png → 415 (magic bytes win; authz first → outsider 404)',
    action: 'POST /api/files',
    mutates: true,
    audit: auditFileP,
    with: PAGES,
    expect: { M: '415', L: '415', Me: '415', W: '404' },
    run: (w) => upload({ pageId: w.pages.pPage.id, name: 'a.png', bytes: exeBytes(), type: 'image/png' }),
  }),
  defineRow({
    id: 'FL-UPLOAD-BIG',
    spec: 'PERM-16 + FILE-2 — an 11 MB image → 413 (authz first → outsider 404)',
    action: 'POST /api/files',
    mutates: true,
    audit: auditFileP,
    with: PAGES,
    expect: { M: '413', L: '413', Me: '413', W: '404' },
    run: (w) => upload({ pageId: w.pages.pPage.id, name: 'big.png', bytes: paddedPng(ELEVEN_MB) }),
  }),
  defineRow({
    id: 'FL-UPLOAD-COVER-PDF',
    spec: 'PERM-16 + M4-D15 — purpose=cover with a PDF → 415',
    action: 'POST /api/files',
    mutates: true,
    audit: auditFileP,
    with: PAGES,
    expect: { M: '415', L: '415', Me: '415', W: '404' },
    run: (w) => upload({ pageId: w.pages.pPage.id, name: 'cover.pdf', bytes: pdfBytes(), purpose: 'cover' }),
  }),

  // ── downloads (FILE-6/7, AC-503) ─────────────────────────────────────────────────────────────────────────────
  defineRow({
    id: 'FL-DOWNLOAD-P',
    spec: 'PERM-16 + FILE-6 + AC-503 — GET /api/files/{pImage}: team 200, non-member 404',
    action: 'GET /api/files/[id]',
    mutates: false,
    with: PAGES,
    expect: PROJ,
    run: async (w) => checkedDownload(await fileGet(w.files.pImage.id), 'IMAGE'),
  }),
  defineRow({
    id: 'FL-DOWNLOAD-PDF',
    spec: 'PERM-16 + FILE-7 — an attachment downloads as Content-Disposition: attachment',
    action: 'GET /api/files/[id]',
    mutates: false,
    with: PAGES,
    expect: PROJ,
    run: async (w) => checkedDownload(await fileGet(w.files.pPdf.id), 'ATTACHMENT'),
  }),
  defineRow({
    id: 'FL-DOWNLOAD-Q',
    spec: 'PERM-06 + M4-D17 — authorised by files.project_id: Q file → manager + Q member only',
    action: 'GET /api/files/[id]',
    mutates: false,
    with: PAGES,
    expect: { M: 'allow', L: '404', Me: '404', W: 'allow' },
    run: (w) => fileGet(w.files.qFile.id),
  }),
  defineRow({
    id: 'FL-DOWNLOAD-ARCH',
    spec: 'PERM-16 + X42 — files of archived A stay downloadable for its team',
    action: 'GET /api/files/[id]',
    mutates: false,
    with: PAGES,
    expect: PROJ,
    run: (w) => fileGet(w.files.aFile.id),
  }),
  defineRow({
    id: 'FL-DOWNLOAD-WIKI',
    spec: 'PERM-17 — wiki files (project_id null) for every user',
    action: 'GET /api/files/[id]',
    mutates: false,
    with: PAGES,
    expect: ALL,
    run: (w) => fileGet(w.files.wikiFile.id),
  }),
  defineRow({
    id: 'FL-DOWNLOAD-DELETED-PAGE',
    spec: 'PERM-16 + M4-D17 — the originating page’s soft delete is ignored (project_id decides)',
    action: 'GET /api/files/[id]',
    mutates: false,
    with: PAGES,
    expect: PROJ,
    setup: async (w) => {
      const page = await makePage({
        project: w.P,
        title: 'ลบไปแล้วมีไฟล์ P',
        deleted: { batch: randomUUID(), daysAgo: 1 },
        createdBy: w.manager,
      })
      return { file: await makeFile({ page, uploadedBy: w.manager }) }
    },
    run: (_w, ctx) => fileGet(ctx.file.id),
  }),
  defineRow({
    id: 'FL-DOWNLOAD-MISSING',
    spec: 'FILE-6 — an unknown file id → 404',
    action: 'GET /api/files/[id]',
    mutates: false,
    with: PAGES,
    expect: each('404'),
    run: () => fileGet(randomUUID()),
  }),
  defineRow({
    id: 'FL-DOWNLOAD-BAD',
    spec: 'FILE-6 + X86 — a malformed file id → 404',
    action: 'GET /api/files/[id]',
    mutates: false,
    with: PAGES,
    expect: each('404'),
    run: () => fileGet('x'),
  }),
]
