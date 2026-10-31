// S2.2 — uploadFile never rejects; server kind decides the block; client pre-check; upload store (FR-525/527).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEditor } from '@/components/editor/schema'
import { th } from '@/i18n/th'
import type { UploadedFileDTO } from '@/lib/contracts/files'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { insertFilesAtCursor, makeUploadFile, uploadStore } from './upload'

const MB = 1024 * 1024
const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const PAGE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const dto = (kind: UploadedFileDTO['kind'], extra: Partial<UploadedFileDTO> = {}): UploadedFileDTO => ({
  id: ID,
  url: `/api/files/${ID}`,
  name: 'a.png',
  size: 123,
  kind,
  mime: 'image/png',
  ...extra,
})
const file = (name: string, type: string, size = 4) => {
  const f = new File([new Uint8Array(4)], name, { type })
  if (size !== 4) Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('makeUploadFile', () => {
  const notify = vi.fn()
  let blocks: Map<string, { id: string; props: { url: string } }>
  const editor = {
    getBlock: (id: string) => blocks.get(id),
    removeBlocks: vi.fn((ids: string[]) => ids.forEach((i) => blocks.delete(i))),
  } as unknown as AppEditor
  const upload = makeUploadFile({
    pageId: PAGE,
    notify,
    limits: DEFAULT_UPLOAD_LIMITS,
    getEditor: () => editor,
  })
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    blocks = new Map([['b1', { id: 'b1', props: { url: '' } }]])
    notify.mockClear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('IMAGE response → image partial block; posts file + pageId', async () => {
    fetchMock.mockResolvedValue(json(201, dto('IMAGE')))
    await expect(upload(file('a.png', 'image/png'), 'b1')).resolves.toEqual({
      type: 'image',
      props: { url: `/api/files/${ID}`, name: 'a.png' },
    })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/files')
    expect(init?.method).toBe('POST')
    const body = init?.body as FormData
    expect(body.get('pageId')).toBe(PAGE)
    expect((body.get('file') as File).name).toBe('a.png')
  })

  it('ATTACHMENT response → file partial with size (server decides, e.g. SVG or fake .png)', async () => {
    fetchMock.mockResolvedValue(json(201, dto('ATTACHMENT', { name: 'สัญญา.pdf', size: 123_456 })))
    await expect(upload(file('a.png', 'image/png'), 'b1')).resolves.toEqual({
      type: 'file',
      props: { url: `/api/files/${ID}`, name: 'สัญญา.pdf', size: 123_456 },
    })
  })

  it('415 → resolves {} + typeNotAllowed; the empty placeholder is removed next tick', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(json(415, { code: 'VALIDATION', message: 'x' }))
    await expect(upload(file('a.pdf', 'application/pdf'), 'b1')).resolves.toEqual({})
    expect(notify).toHaveBeenCalledWith(th.editor.upload.typeNotAllowed)
    expect(blocks.has('b1')).toBe(true)
    await vi.runAllTimersAsync()
    expect(blocks.has('b1')).toBe(false)
  })

  it('413 → tooLarge message of the kind', async () => {
    fetchMock.mockResolvedValue(json(413, {}))
    await expect(upload(file('a.png', 'image/png'), 'b1')).resolves.toEqual({})
    expect(notify).toHaveBeenCalledWith(th.editor.upload.tooLargeImage(10))
  })

  it('a block that already has a url is never removed on failure (replace)', async () => {
    vi.useFakeTimers()
    blocks.set('b1', { id: 'b1', props: { url: `/api/files/${ID}` } })
    fetchMock.mockResolvedValue(json(500, {}))
    await expect(upload(file('a.png', 'image/png'), 'b1')).resolves.toEqual({})
    await vi.runAllTimersAsync()
    expect(blocks.has('b1')).toBe(true)
    expect(notify).toHaveBeenCalledWith(th.editor.upload.failed)
  })

  it('fetch throws → resolves {} + failed', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'))
    await expect(upload(file('a.png', 'image/png'), 'b1')).resolves.toEqual({})
    expect(notify).toHaveBeenCalledWith(th.editor.upload.failed)
  })

  it('11 MB png → no fetch, tooLargeImage(10)', async () => {
    await expect(upload(file('big.png', 'image/png', 11 * MB), 'b1')).resolves.toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(th.editor.upload.tooLargeImage(10))
  })

  it('unknown type → no fetch, typeNotAllowed', async () => {
    await expect(upload(file('setup.exe', 'application/x-msdownload'), 'b1')).resolves.toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(th.editor.upload.typeNotAllowed)
  })

  it('uploadStore.has(blockId) is true while the fetch is pending, false after', async () => {
    let release!: (r: Response) => void
    fetchMock.mockReturnValue(new Promise<Response>((r) => (release = r)))
    const listener = vi.fn()
    const off = uploadStore.subscribe(listener)
    const p = upload(file('a.png', 'image/png'), 'b1')
    expect(uploadStore.has('b1')).toBe(true)
    release(json(201, dto('IMAGE')))
    await expect(p).resolves.toMatchObject({ type: 'image' })
    expect(uploadStore.has('b1')).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    off()
  })
})

describe('insertFilesAtCursor', () => {
  it('replaces an empty block, inserts later files after it, applies results and toasts rejects', async () => {
    const notify = vi.fn()
    const live = new Set<string>(['cur'])
    const updates: [string, unknown][] = []
    let n = 0
    const editor = {
      getTextCursorPosition: () => ({ block: { id: 'cur', content: [] } }),
      updateBlock: vi.fn((ref: { id: string } | string, partial: unknown) => {
        const id = typeof ref === 'string' ? ref : ref.id
        updates.push([id, partial])
        return { id, content: undefined }
      }),
      insertBlocks: vi.fn(() => {
        const id = `new${++n}`
        live.add(id)
        return [{ id, content: undefined }]
      }),
      getBlock: (id: string) => (live.has(id) ? { id } : undefined),
      uploadFile: vi.fn(async (f: File) => ({
        type: 'image',
        props: { url: `/api/files/${ID}`, name: f.name },
      })),
    } as unknown as AppEditor
    await insertFilesAtCursor(
      editor,
      [
        file('a.png', 'image/png'),
        file('x.exe', 'application/x-msdownload'),
        file('b.pdf', 'application/pdf'),
      ],
      notify,
      DEFAULT_UPLOAD_LIMITS,
    )
    expect(notify).toHaveBeenCalledWith(th.editor.upload.typeNotAllowed)
    expect(updates[0]).toEqual(['cur', { type: 'image', props: { name: 'a.png' } }])
    expect(editor.insertBlocks).toHaveBeenCalledWith(
      [{ type: 'file', props: { name: 'b.pdf' } }],
      expect.anything(),
      'after',
    )
    expect(editor.uploadFile).toHaveBeenCalledTimes(2)
    expect(updates.map(([id]) => id)).toEqual(['cur', 'cur', 'new1'])
  })
})
