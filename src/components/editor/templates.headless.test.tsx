// S2.3 — Appendix B templates and a real document load in a headless editor with OUR schema (TPL-B1…B3, M4-D8):
// no throw, ids assigned, same content_text, and the editor's JSON (as autosave sends it) passes the server schema.
import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, it } from 'vitest'
import { charterTemplate, meetingTemplate, sopTemplate } from '@/i18n/templates.th'
import { extractContentText } from '@/lib/editor/content-text'
import complexDoc from '@/lib/editor/__fixtures__/complex-doc.json'
import { prepareInitialContent } from '@/lib/editor/sanitize'
import { pageContentSchema } from '@/lib/schemas/page-content'
import { schema } from './schema'

const cases: [string, unknown[]][] = [
  ['charter', charterTemplate().content],
  [
    'charter (filled)',
    charterTemplate({ clientName: 'ลูกค้า A', leadName: 'Cindy', certaintyLabel: 'ยืนยันแล้ว' }).content,
  ],
  ['meeting', meetingTemplate('30 ก.ย. 2569').content],
  ['sop', sopTemplate().content],
  ['complex-doc.json', complexDoc],
]

describe.each(cases)('%s in a headless editor', (_name, content) => {
  const editor = BlockNoteEditor.create({ schema, initialContent: prepareInitialContent(content) })
  const doc = editor.document

  it('loads with an id on every block', () => {
    expect(doc.length).toBeGreaterThan(0)
    const walk = (bs: readonly { id: string; children: readonly unknown[] }[]): void => {
      for (const b of bs) {
        expect(typeof b.id).toBe('string')
        expect(b.id.length).toBeGreaterThan(0)
        walk(b.children as typeof bs)
      }
    }
    walk(doc)
  })

  it('keeps the searchable text', () => {
    expect(extractContentText(doc)).toBe(extractContentText(content))
  })

  it('serialises to content the server accepts', () => {
    const r = pageContentSchema.safeParse(JSON.parse(JSON.stringify(doc)))
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues.slice(0, 3))).toBe(true)
  })
})
