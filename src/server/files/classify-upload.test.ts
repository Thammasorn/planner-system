// M4 S1.7 — upload classification by magic bytes + narrow extension fallbacks (SPEC §7.6, FILE-3…5, M4-D15).
import { describe, expect, it } from 'vitest'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import {
  cfbBytes,
  exeBytes,
  gifBytes,
  jpegBytes,
  paddedPng,
  pdfBytes,
  PNG_1X1,
  SVG_TEXT,
  thaiCsvWin874,
  webpBytes,
  XML_SVG_TEXT,
  zipOneFile,
} from '../../../tests/helpers/files'
import { classifyUpload } from './classify-upload'

const MB = 1024 * 1024
const text = (s: string): Uint8Array => new TextEncoder().encode(s)
const classify = (bytes: Uint8Array, name: string) => classifyUpload(bytes, name, DEFAULT_UPLOAD_LIMITS)

describe('classifyUpload', () => {
  it.each([
    [PNG_1X1, 'a.png', 'image/png'],
    [jpegBytes(), 'a.jpg', 'image/jpeg'],
    [gifBytes(), 'a.gif', 'image/gif'],
    [webpBytes(), 'a.webp', 'image/webp'],
  ])('raster image %# → IMAGE with the detected MIME', async (bytes, name, mime) => {
    expect(await classify(bytes, name)).toMatchObject({ ok: true, kind: 'IMAGE', mime })
  })

  it('pdf, OOXML by extension, plain zip', async () => {
    expect(await classify(pdfBytes(), 'สัญญา.pdf')).toEqual({
      ok: true,
      kind: 'ATTACHMENT',
      ext: 'pdf',
      mime: 'application/pdf',
    })
    expect(await classify(zipOneFile('word/document.xml', '<w/>'), 'a.docx')).toMatchObject({
      kind: 'ATTACHMENT',
      ext: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    expect(await classify(zipOneFile('x.txt', 'x'), 'a.zip')).toMatchObject({
      kind: 'ATTACHMENT',
      mime: 'application/zip',
    })
  })

  it('legacy Office only inside the CFB family', async () => {
    expect(await classify(cfbBytes(), 'a.doc')).toMatchObject({ kind: 'ATTACHMENT', mime: 'application/msword' })
    expect(await classify(cfbBytes(), 'a.msi')).toEqual({ ok: false, code: 'UNSUPPORTED_TYPE' })
  })

  it('content wins over the claimed name', async () => {
    expect(await classify(exeBytes(), 'a.png')).toEqual({ ok: false, code: 'UNSUPPORTED_TYPE' })
    expect(await classify(PNG_1X1, 'a.svg')).toMatchObject({ ok: true, kind: 'IMAGE', mime: 'image/png' })
  })

  it('SVG is only ever an attachment', async () => {
    expect(await classify(text(SVG_TEXT), 'a.svg')).toMatchObject({ kind: 'ATTACHMENT', mime: 'image/svg+xml' })
    expect(await classify(text(XML_SVG_TEXT), 'a.svg')).toMatchObject({
      kind: 'ATTACHMENT',
      mime: 'image/svg+xml',
    })
  })

  it('text: csv in Windows-874, HTML named .txt stays text/plain', async () => {
    expect(await classify(thaiCsvWin874(), 'a.csv')).toMatchObject({ kind: 'ATTACHMENT', mime: 'text/csv' })
    expect(await classify(text('<html><script>alert(1)</script></html>'), 'a.txt')).toMatchObject({
      kind: 'ATTACHMENT',
      mime: 'text/plain',
    })
  })

  it('size limits by kind; empty bytes are unsupported', async () => {
    expect(await classify(paddedPng(11 * MB), 'a.png')).toEqual({ ok: false, code: 'TOO_LARGE' })
    const bigPdf = new Uint8Array(26 * MB)
    bigPdf.set(pdfBytes())
    expect(await classify(bigPdf, 'a.pdf')).toEqual({ ok: false, code: 'TOO_LARGE' })
    expect(await classify(new Uint8Array(0), 'a.txt')).toEqual({ ok: false, code: 'UNSUPPORTED_TYPE' })
    expect(
      await classifyUpload(paddedPng(2 * MB), 'a.png', { imageBytes: MB, attachmentBytes: MB }),
    ).toEqual({ ok: false, code: 'TOO_LARGE' })
  })
})
