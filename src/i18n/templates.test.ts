// S0.12 — Appendix B templates (TPL-B1…B3). Charter assertions use containment (M4-D37c): M10 adds a live section.
import { describe, expect, it } from 'vitest'
import { extractContentText } from '@/lib/editor/content-text'
import { BLOCK_TYPES, pageContentSchema, type BlockInput } from '@/lib/schemas/page-content'
import { buildTemplate, charterTemplate, meetingTemplate, sopTemplate, tableBlock } from './templates.th'
import { th } from './th'

function walk(blocks: readonly BlockInput[]): BlockInput[] {
  return blocks.flatMap((b) => [b, ...walk(b.children ?? [])])
}

const headings = (blocks: readonly BlockInput[], level: number): unknown[] =>
  walk(blocks)
    .filter((b) => b.type === 'heading' && b.props?.level === level)
    .map((b) => b.content)

describe('templates', () => {
  const all = [
    charterTemplate(),
    charterTemplate({ clientName: 'Coral' }),
    meetingTemplate('30 ก.ย. 2569'),
    sopTemplate(),
  ]

  it('every template passes pageContentSchema', () => {
    for (const t of all) expect(pageContentSchema.safeParse(t.content).success, t.title).toBe(true)
  })

  it('charter pre-fills client, lead and certainty (M4-D6)', () => {
    const text = extractContentText(
      charterTemplate({
        clientName: 'Coral',
        leadName: 'Cindy',
        certaintyLabel: th.projects.certainty.CONFIRMED,
      }).content,
    )
    expect(text).toContain('ลูกค้า Coral')
    expect(text).toContain('Project Lead Cindy')
    expect(text).toContain(`ความแน่นอน ${th.projects.certainty.CONFIRMED}`)
  })

  it('charter: title, icon, 5 tables, first table 5 rows, stakeholder table shape', () => {
    const t = charterTemplate()
    expect(t.title).toBe(th.pages.charterTitle)
    expect(t.icon).toBe('📋')
    const tables = t.content.filter((b) => b.type === 'table')
    expect(tables).toHaveLength(5)
    expect((tables[0]?.content as { rows: unknown[] }).rows).toHaveLength(5)
    expect(t.content).toContainEqual(
      tableBlock([
        ['ชื่อ / หน่วยงาน', 'บทบาท', 'ความคาดหวัง', 'ช่องทางติดต่อ'],
        ['', '', '', ''],
      ]),
    )
  })

  it('charter h2 headings contain the B.1 sections in order', () => {
    const h = headings(charterTemplate().content, 2)
    const expected = [
      'ข้อมูลโปรเจค',
      'ที่มาและปัญหา',
      'วัตถุประสงค์',
      'ขอบเขตงาน',
      'ผลลัพธ์ที่ส่งมอบ',
      'Milestones สำคัญ',
      'ทีมงานและบทบาท',
      'ผู้มีส่วนได้ส่วนเสีย',
      'ความเสี่ยงและข้อสมมติฐาน',
      'เกณฑ์ความสำเร็จ',
      'การสื่อสาร',
    ]
    expect(h).toEqual(expect.arrayContaining(expected))
    const idx = expected.map((e) => h.indexOf(e))
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
  })

  it('meeting and SOP titles/icons', () => {
    expect(meetingTemplate('30 ก.ย. 2569').title).toBe(th.pages.meetingTitle('30 ก.ย. 2569'))
    expect(meetingTemplate('30 ก.ย. 2569').icon).toBe('📝')
    expect(sopTemplate().title).toBe('')
    expect(sopTemplate().icon).toBe('📘')
    expect(buildTemplate('meeting', { dateLabel: 'x' }).title).toBe(th.pages.meetingTitle('x'))
    expect(buildTemplate('charter', { dateLabel: 'x' })).toEqual(charterTemplate())
    expect(buildTemplate('sop', { dateLabel: 'x' })).toEqual(sopTemplate())
  })

  it('tableBlock shape (shared with M11 demo content)', () => {
    const b = tableBlock([
      ['ก', 'ข'],
      ['', ''],
    ])
    expect(b).toEqual({
      type: 'table',
      content: { type: 'tableContent', headerRows: 1, rows: [{ cells: ['ก', 'ข'] }, { cells: ['', ''] }] },
    })
    expect(pageContentSchema.safeParse([b]).success).toBe(true)
  })

  it('no template contains a subpage or mention', () => {
    for (const t of all) {
      const json = JSON.stringify(t.content)
      expect(json).not.toContain('"subpage"')
      expect(json).not.toContain('"mention"')
    }
  })

  // M4-only (X78): M10 S0.8 replaces this case
  it('charter has no live section and only M4 block types', () => {
    const t = charterTemplate()
    expect(headings(t.content, 2)).not.toContain('งานและภาระของทีม')
    for (const b of walk(t.content)) expect(BLOCK_TYPES).toContain(b.type)
  })
})
