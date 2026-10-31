// M4 S1.7 — POST /api/files and GET /api/files/[id] (SPEC §7.6, FILE-1…8, AC-503, M4-D15/D16/D17/D18).
import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as downloadRoute } from '@/app/api/files/[id]/route'
import { POST as uploadRoute } from '@/app/api/files/route'
import type { UploadedFileDTO } from '@/lib/contracts/files'
import { FILE_URL_RE } from '@/lib/files/upload-rules'
import { callRoute } from '../../../tests/authz/_support/http'
import { asUser } from '../../../tests/helpers/as-user'
import { auditCount, auditRowsAfter } from '../../../tests/helpers/audit'
import { exeBytes, pdfBytes, PNG_1X1, uploadRequest } from '../../../tests/helpers/files'
import { createWorld, type World } from '../../../tests/helpers/world'
import { db } from '../db/client'
import { files } from '../db/schema'
import { contentDisposition, sanitizeFileName } from './files'

let w: World

beforeEach(async () => {
  w = await createWorld({ with: ['pages', 'files'] })
})

const upload = async (o: Parameters<typeof uploadRequest>[0]): Promise<Response> =>
  uploadRoute(await uploadRequest(o), { params: Promise.resolve({}) })

const download = (id: string): Promise<Response> => callRoute(downloadRoute, `/api/files/${id}`, { id })

async function storedFiles(): Promise<string[]> {
  const root = process.env.UPLOAD_DIR!
  const out: string[] = []
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else out.push(path.relative(root, full))
    }
  }
  await walk(root)
  return out.sort()
}

describe('POST /api/files', () => {
  it('member uploads a PNG to pPage → 201, IMAGE row on P, bytes on disk, one audit row', async () => {
    asUser(w.member)
    const mark = await auditCount()
    const res = await upload({ pageId: w.pages.pPage.id, name: 'a.png', bytes: PNG_1X1, type: 'text/html' })
    expect(res.status).toBe(201)
    const dto = (await res.json()) as UploadedFileDTO
    expect(dto).toMatchObject({ kind: 'IMAGE', mime: 'image/png', name: 'a.png', size: PNG_1X1.length })
    expect(dto.url).toMatch(FILE_URL_RE)
    const [row] = await db.select().from(files).where(eq(files.id, dto.id))
    expect(row).toMatchObject({ kind: 'IMAGE', projectId: w.P.id, pageId: w.pages.pPage.id, uploadedBy: w.member.id })
    expect(row!.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/)
    expect(await storedFiles()).toContain(row!.storageKey)
    const audits = await auditRowsAfter(mark)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ entity: 'file', action: 'create', entityId: dto.id, projectId: w.P.id })
  })

  it('storage key uses serverToday() (2026/09 with APP_NOW)', async () => {
    vi.stubEnv('ALLOW_TEST_HOOKS', '1')
    vi.stubEnv('APP_NOW', '2026-09-30T10:00:00+07:00')
    asUser(w.member)
    const res = await upload({ pageId: w.pages.wiki.id, name: 'a.png', bytes: PNG_1X1 })
    const dto = (await res.json()) as UploadedFileDTO
    const [row] = await db.select().from(files).where(eq(files.id, dto.id))
    expect(row!.storageKey.startsWith('2026/09/')).toBe(true)
    expect(row!.projectId).toBeNull()
  })

  it('authz: outsider → 404, member on aPage → 403, worker on wikiProtected → 403, anyone on wiki → 201', async () => {
    asUser(w.outsider)
    expect((await upload({ pageId: w.pages.pPage.id, name: 'a.png', bytes: PNG_1X1 })).status).toBe(404)
    expect((await upload({ pageId: w.pages.wiki.id, name: 'a.png', bytes: PNG_1X1 })).status).toBe(201)
    asUser(w.member)
    expect((await upload({ pageId: w.pages.aPage.id, name: 'a.png', bytes: PNG_1X1 })).status).toBe(403)
    expect((await upload({ pageId: w.pages.wikiProtected.id, name: 'a.png', bytes: PNG_1X1 })).status).toBe(403)
    expect(
      (await upload({ pageId: w.pages.pPage.id, name: 'a.png', bytes: PNG_1X1, origin: 'https://evil.example' }))
        .status,
    ).toBe(403)
  })

  it('Thai names kept; Content-Length lie → 400; .exe → 415 with nothing on disk; cover pdf → 415', async () => {
    asUser(w.member)
    const thai = await upload({ pageId: w.pages.pPage.id, name: 'สัญญา.pdf', bytes: pdfBytes() })
    expect(thai.status).toBe(201)
    expect(await thai.json()).toMatchObject({ name: 'สัญญา.pdf', kind: 'ATTACHMENT', mime: 'application/pdf' })
    const lie = await upload({ pageId: w.pages.pPage.id, name: 'a.png', bytes: PNG_1X1, contentLength: 10 })
    expect(lie.status).toBe(400)
    const before = await storedFiles()
    expect((await upload({ pageId: w.pages.pPage.id, name: 'a.png', bytes: exeBytes() })).status).toBe(415)
    expect(
      (await upload({ pageId: w.pages.pPage.id, name: 'a.pdf', bytes: pdfBytes(), purpose: 'cover' })).status,
    ).toBe(415)
    expect(await storedFiles()).toEqual(before)
  })
})

describe('GET /api/files/[id]', () => {
  it('image inline with private cache; attachment with RFC 5987 name and CSP sandbox', async () => {
    asUser(w.member)
    const img = await download(w.files.pImage.id)
    expect(img.status).toBe(200)
    expect(img.headers.get('content-type')).toBe('image/png')
    expect(img.headers.get('x-content-type-options')).toBe('nosniff')
    expect(img.headers.get('content-disposition')).toMatch(/^inline;/)
    expect(img.headers.get('cache-control')).toBe('private, max-age=3600')
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG_1X1)
    const pdf = await download(w.files.pPdf.id)
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('content-disposition')).toMatch(/^attachment; filename="[^"]*"; filename\*=UTF-8''%E0%B8%AA/)
    expect(pdf.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
    expect(pdf.headers.get('cache-control')).toBe('private, no-store')
    await pdf.body?.cancel()
  })

  it('AC-503: outsider → 404 for a P image; Q, wiki and archived files follow project visibility', async () => {
    asUser(w.outsider)
    expect((await download(w.files.pImage.id)).status).toBe(404)
    expect((await download(w.files.qFile.id)).status).toBe(200)
    expect((await download(w.files.wikiFile.id)).status).toBe(200)
    asUser(w.member)
    expect((await download(w.files.aFile.id)).status).toBe(200)
    expect((await download('x')).status).toBe(404)
    expect((await download('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).status).toBe(404)
  })

  it('a row whose bytes are gone → 404', async () => {
    await rm(path.join(process.env.UPLOAD_DIR!, w.files.pImage.storageKey))
    asUser(w.member)
    expect((await download(w.files.pImage.id)).status).toBe(404)
  })
})

describe('helpers', () => {
  it('sanitizeFileName strips separators/controls, collapses spaces, caps at 200 keeping the extension', () => {
    expect(sanitizeFileName('../a/b\\c:d*?.pdf')).toBe('..abcd.pdf')
    expect(sanitizeFileName('  ราย   งาน\u0007.xlsx ')).toBe('ราย งาน.xlsx')
    expect(sanitizeFileName('///')).toBe('file')
    const long = sanitizeFileName(`${'ก'.repeat(300)}.docx`)
    expect([...long]).toHaveLength(200)
    expect(long.endsWith('.docx')).toBe(true)
  })

  it('contentDisposition has an ASCII fallback and the UTF-8 name', () => {
    expect(contentDisposition('attachment', 'สัญญา (1).pdf')).toBe(
      `attachment; filename="_____ (1).pdf"; filename*=UTF-8''${encodeURIComponent('สัญญา')}%20%281%29.pdf`,
    )
  })
})
