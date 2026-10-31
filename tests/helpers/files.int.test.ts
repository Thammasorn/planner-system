// Smoke test of the byte fixtures (plan/m04 S0.15): file-type 22 detects them the way the classifier expects.
import { fileTypeFromBuffer } from 'file-type'
import { describe, expect, it } from 'vitest'
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
  uploadRequest,
  webpBytes,
  XML_SVG_TEXT,
  zipOneFile,
} from './files'

const ext = async (b: Uint8Array) => (await fileTypeFromBuffer(b))?.ext

describe('byte fixtures', () => {
  it('detects images, pdf, zip, cfb and exe', async () => {
    expect(await ext(PNG_1X1)).toBe('png')
    expect(await ext(jpegBytes())).toBe('jpg')
    expect(await ext(gifBytes())).toBe('gif')
    expect(await ext(webpBytes())).toBe('webp')
    expect(await ext(pdfBytes())).toBe('pdf')
    expect(await ext(zipOneFile('a.txt', 'hello'))).toBe('zip')
    expect(await ext(cfbBytes())).toBe('cfb')
    expect(await ext(exeBytes())).toBe('exe')
  })

  it('text formats have no magic bytes (SVG → undefined, XML SVG → xml)', async () => {
    expect(await ext(new TextEncoder().encode(SVG_TEXT))).toBeUndefined()
    expect(await ext(new TextEncoder().encode(XML_SVG_TEXT))).toBe('xml')
    expect(new TextDecoder('windows-874').decode(thaiCsvWin874())).toBe('วัน,1\n')
  })

  it('paddedPng has the requested size and stays a png', async () => {
    const b = paddedPng(2048)
    expect(b.length).toBe(2048)
    expect(await ext(b)).toBe('png')
  })

  it('uploadRequest builds a multipart POST with Content-Length', async () => {
    const req = await uploadRequest({
      pageId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      name: 'สัญญา.pdf',
      bytes: pdfBytes(),
      purpose: 'cover',
      origin: 'http://localhost',
    })
    expect(req.method).toBe('POST')
    expect(req.url).toBe('http://localhost/api/files')
    expect(req.headers.get('origin')).toBe('http://localhost')
    const len = Number(req.headers.get('content-length'))
    const form = await req.formData()
    expect(form.get('pageId')).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301')
    expect(form.get('purpose')).toBe('cover')
    const file = form.get('file') as File
    expect(file.name).toBe('สัญญา.pdf')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(pdfBytes())
    expect(len).toBeGreaterThan(pdfBytes().length)
  })
})
