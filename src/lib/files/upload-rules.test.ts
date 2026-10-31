import { describe, expect, it } from 'vitest'
import { formatBytes } from './format-bytes'
import { DEFAULT_UPLOAD_LIMITS, FILE_URL_RE, fileUrl, precheckFile } from './upload-rules'

const MB = 1024 * 1024
const V4 = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

describe('precheckFile', () => {
  const check = (name: string, type: string, size: number) =>
    precheckFile({ name, type, size }, DEFAULT_UPLOAD_LIMITS)

  it('classifies images by MIME and size', () => {
    expect(check('a.png', 'image/png', 9 * MB)).toEqual({ kind: 'IMAGE' })
    expect(check('a.png', 'image/png', 11 * MB)).toEqual({ error: 'tooLargeImage' })
  })

  it('treats SVG as an attachment, never an image', () => {
    expect(check('logo.svg', 'image/svg+xml', 100)).toEqual({ kind: 'ATTACHMENT' })
  })

  it('rejects unknown types; extensions are case-insensitive', () => {
    expect(check('setup.exe', 'application/x-msdownload', 100)).toEqual({ error: 'typeNotAllowed' })
    expect(check('สัญญา.PDF', 'application/pdf', 100)).toEqual({ kind: 'ATTACHMENT' })
    expect(check('big.zip', 'application/zip', 26 * MB)).toEqual({ error: 'tooLargeFile' })
    expect(check('noext', '', 1)).toEqual({ error: 'typeNotAllowed' })
  })

  it('uses the limits it is given', () => {
    expect(
      precheckFile(
        { name: 'a.png', type: 'image/png', size: 2 * MB },
        { imageBytes: MB, attachmentBytes: MB },
      ),
    ).toEqual({
      error: 'tooLargeImage',
    })
  })
})

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [123_456, '120.6 KB'],
    [5_242_880, '5.0 MB'],
    [3 * 1024 * MB, '3.0 GB'],
  ])('%d → %s', (n, s) => {
    expect(formatBytes(n)).toBe(s)
  })
})

describe('FILE_URL_RE', () => {
  it('accepts only same-origin /api/files/<uuid>', () => {
    expect(FILE_URL_RE.test(fileUrl(V4))).toBe(true)
    expect(FILE_URL_RE.test(`https://x/api/files/${V4}`)).toBe(false)
    expect(FILE_URL_RE.test(`/api/files/${V4}?x=1`)).toBe(false)
    expect(FILE_URL_RE.test('/api/files/abc')).toBe(false)
  })
})
