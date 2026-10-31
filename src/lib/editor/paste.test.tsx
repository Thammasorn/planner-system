// S2.2 — paste routing (FR-524/525, AC-502/503, PLAN §3.11 six routes) + HTML helpers (jsdom, `ui` project).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEditor } from '@/components/editor/schema'
import { th } from '@/i18n/th'
import { DEFAULT_UPLOAD_LIMITS } from '@/lib/files/upload-rules'
import { externalImagesToLinks, htmlHasText, makePasteHandler } from './paste'
import { gridToHtmlTable } from './tsv'
import { insertFilesAtCursor } from './upload'

vi.mock('./upload', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./upload')>()
  return { ...orig, insertFilesAtCursor: vi.fn(async () => {}) }
})

const V4 = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

/** DataTransfer stand-in: only what the handler reads. */
function clip(data: Record<string, string>, files: File[] = []): ClipboardEvent {
  return {
    clipboardData: {
      types: [...Object.keys(data), ...(files.length > 0 ? ['Files'] : [])],
      getData: (t: string) => data[t] ?? '',
      files,
    },
  } as unknown as ClipboardEvent
}

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'image.png', { type: 'image/png' })

describe('makePasteHandler', () => {
  const notify = vi.fn()
  const handler = makePasteHandler({ notify, limits: DEFAULT_UPLOAD_LIMITS })
  let editor: AppEditor & { pasteHTML: ReturnType<typeof vi.fn> }
  let defaultPasteHandler: ReturnType<typeof vi.fn>

  beforeEach(() => {
    editor = { pasteHTML: vi.fn() } as unknown as typeof editor
    defaultPasteHandler = vi.fn(() => true)
    vi.mocked(insertFilesAtCursor).mockClear()
  })
  const run = (event: ClipboardEvent) =>
    handler({ event, editor, defaultPasteHandler: defaultPasteHandler as never })

  it('1: BlockNote-internal copy → default handler', () => {
    expect(run(clip({ 'blocknote/html': '<div/>', 'text/html': '<table><tr><td>x</td></tr></table>' }))).toBe(
      true,
    )
    expect(defaultPasteHandler).toHaveBeenCalledWith()
    expect(editor.pasteHTML).not.toHaveBeenCalled()
  })

  it('2: spreadsheet HTML table wins over files and markdown-looking TSV', () => {
    const html = '<table><tr><td>Cindy</td><td>task_name_1</td></tr></table>'
    expect(run(clip({ 'text/html': html, 'text/plain': 'Cindy\ttask_name_1' }, [png()]))).toBe(true)
    expect(editor.pasteHTML).toHaveBeenCalledWith(html)
    expect(insertFilesAtCursor).not.toHaveBeenCalled()
    expect(defaultPasteHandler).not.toHaveBeenCalled()
  })

  it('2b: a table with external images pastes links instead', () => {
    run(clip({ 'text/html': '<table><tr><td><img src="https://x/a.png" alt="a"></td></tr></table>' }))
    const pasted = String(editor.pasteHTML.mock.calls[0]?.[0])
    expect(pasted).toContain('<a href="https://x/a.png">a</a>')
    expect(pasted).not.toContain('<img')
  })

  it('3: files without meaningful HTML → upload at the cursor', () => {
    const f = png()
    expect(run(clip({ 'text/html': '<meta charset="utf-8"><img src="https://x/c.png">' }, [f]))).toBe(true)
    expect(insertFilesAtCursor).toHaveBeenCalledWith(editor, [f], notify, DEFAULT_UPLOAD_LIMITS)
    expect(editor.pasteHTML).not.toHaveBeenCalled()
  })

  it('4: TSV-only grid → HTML table', () => {
    const tsv = 'ชื่อ\tงาน\nCindy\ttask_name_1\nIvy\t1. วางแผน\n'
    expect(run(clip({ 'text/plain': tsv }))).toBe(true)
    expect(editor.pasteHTML).toHaveBeenCalledWith(
      gridToHtmlTable([
        ['ชื่อ', 'งาน'],
        ['Cindy', 'task_name_1'],
        ['Ivy', '1. วางแผน'],
      ]),
    )
  })

  it('5: other HTML with external images → links', () => {
    expect(run(clip({ 'text/html': '<p>ดู <img src="https://x/c.png" alt="แมว"></p>' }))).toBe(true)
    const pasted = String(editor.pasteHTML.mock.calls[0]?.[0])
    expect(pasted).toContain('<a href="https://x/c.png">แมว</a>')
    expect(pasted).not.toContain('<img')
  })

  it('6: everything else → default, HTML preferred over markdown sniffing', () => {
    expect(run(clip({ 'text/plain': 'สวัสดี *ครับ*' }))).toBe(true)
    expect(defaultPasteHandler).toHaveBeenCalledWith({
      prioritizeMarkdownOverHTML: false,
      plainTextAsMarkdown: true,
    })
    expect(editor.pasteHTML).not.toHaveBeenCalled()
  })

  it('no clipboard data → default', () => {
    run({ clipboardData: null } as unknown as ClipboardEvent)
    expect(defaultPasteHandler).toHaveBeenCalledWith()
  })
})

describe('externalImagesToLinks', () => {
  it('turns an external image into a link with its alt text', () => {
    const out = externalImagesToLinks('<p><img src="https://x/c.png" alt="แมว"></p>')
    expect(out).toContain('<a href="https://x/c.png">แมว</a>')
    expect(out).not.toContain('<img')
  })

  it('data: images keep the fallback text only (no href)', () => {
    const out = externalImagesToLinks('<p><img src="data:image/png;base64,AAAA"></p>')
    expect(out).toContain(th.editor.pasteImageLinkFallback)
    expect(out).not.toContain('href')
    expect(out).not.toContain('<img')
  })

  it('keeps same-origin file images', () => {
    const html = `<p><img src="/api/files/${V4}" alt="x"></p>`
    expect(externalImagesToLinks(html)).toContain(`<img src="/api/files/${V4}"`)
  })
})

describe('htmlHasText', () => {
  it('ignores style/meta-only HTML', () => {
    expect(htmlHasText('<style>p{}</style><meta>')).toBe(false)
  })
  it('detects visible text', () => {
    expect(htmlHasText('<b>hi</b>')).toBe(true)
  })
})
