/**
 * Clipboard / drag-and-drop helpers for the editor (plan/m04-pages-editor.md S4.7, r3 §14.2 techniques verified in
 * Chromium, r4 §41, M4-D34). `syntheticPaste` dispatches a ClipboardEvent with exact payloads (Excel HTML/TSV, files);
 * `realClipboardImage` writes a real `ClipboardItem` so the next `ControlOrMeta+V` is a trusted paste.
 */
import type { Page } from '@playwright/test'

export interface B64File {
  name: string
  type: string
  b64: string
}

/** Same bytes as tests/helpers/files.ts PNG_1X1 (a valid, browser-decodable 1×1 RGBA PNG; CRCs checked). */
export const PNG_1X1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
/** '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' (magic bytes %PDF → application/pdf). */
export const PDF_B64 = 'JVBERi0xLjQKMSAwIG9iajw8Pj5lbmRvYmoKdHJhaWxlcjw8Pj4KJSVFT0YK'
/** `<svg xmlns="http://www.w3.org/2000/svg"/>` (FILE-4: accepted only as an attachment). */
export const SVG_B64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')
/** 'MZ' + zeros — a Windows executable whatever its name says (FILE-5). */
export const EXE_B64 = Buffer.from(
  Uint8Array.from({ length: 128 }, (_, i) => (i === 0 ? 0x4d : i === 1 ? 0x5a : 0)),
).toString('base64')

/** Synthetic paste on `.bn-editor` (r3 §14.2 verbatim): DataTransfer with string items and Files. */
export async function syntheticPaste(
  page: Page,
  items: Record<string, string>,
  files: B64File[] = [],
): Promise<void> {
  await page.evaluate(
    ({ items, files }) => {
      const dt = new DataTransfer()
      for (const [k, v] of Object.entries(items)) dt.setData(k, v)
      for (const f of files)
        dt.items.add(
          new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.type }),
        )
      const editor = document.querySelector('.bn-editor')
      if (!editor) throw new Error('syntheticPaste: no .bn-editor on the page')
      editor.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      )
    },
    { items, files },
  )
}

/** Puts a PNG on the real system clipboard (permissions from playwright.config); paste it with ControlOrMeta+V. */
export async function realClipboardImage(page: Page, b64Png: string): Promise<void> {
  await page.evaluate(async (b64) => {
    const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  }, b64Png)
}

/** Drops a file on the centre of the editor's last block (r3 §14.2 DragEvent('drop')). */
export async function dropFile(page: Page, file: B64File): Promise<void> {
  const last = page.locator('.bn-editor .bn-block-outer').last()
  const box = await last.boundingBox()
  if (!box) throw new Error('dropFile: the last editor block is not visible')
  await page.evaluate(
    ({ file, x, y }) => {
      const dt = new DataTransfer()
      dt.items.add(
        new File([Uint8Array.from(atob(file.b64), (c) => c.charCodeAt(0))], file.name, { type: file.type }),
      )
      const editor = document.querySelector('.bn-editor')
      if (!editor) throw new Error('dropFile: no .bn-editor on the page')
      editor.dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }),
      )
    },
    { file, x: box.x + box.width / 2, y: box.y + box.height / 2 },
  )
}
