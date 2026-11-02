// S0.12 — Appendix B templates (TPL-B1…B3). Charter assertions use containment (M4-D37c); M10 S0.8 adds the live section.
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

  // M10 S0.8 (FR-1305, TPL-B1 v3.1, M10-D12) — replaces M4's "no live section" case
  describe('charter live section "งานและภาระของทีม"', () => {
    const t = charterTemplate()
    const SECTION = 'งานและภาระของทีม'

    it('h2 order ends with the section right after "Milestones สำคัญ"', () => {
      expect(headings(t.content, 2).slice(-7)).toEqual([
        'Milestones สำคัญ',
        SECTION,
        'ทีมงานและบทบาท',
        'ผู้มีส่วนได้ส่วนเสีย',
        'ความเสี่ยงและข้อสมมติฐาน',
        'เกณฑ์ความสำเร็จ',
        'การสื่อสาร',
      ])
    })

    it('the blocks right after the heading are taskView (BOARD) then projectWorkload, view config only', () => {
      const i = t.content.findIndex((b) => b.type === 'heading' && b.content === SECTION)
      expect(i).toBeGreaterThan(0)
      const [tv, pw, next] = t.content.slice(i + 1, i + 4)
      expect(tv).toEqual({ type: 'taskView', props: { view: 'BOARD' } })
      expect(pw).toEqual({ type: 'projectWorkload', props: {} })
      expect(next).toMatchObject({ type: 'heading', content: 'ทีมงานและบทบาท' })
      for (const b of [tv!, pw!]) {
        expect(b).not.toHaveProperty('content')
        expect(b.props ?? {}).not.toHaveProperty('projectId')
      }
    })

    it('still 5 tables, every block type is known, pageContentSchema parses it', () => {
      expect(t.content.filter((b) => b.type === 'table')).toHaveLength(5)
      for (const b of walk(t.content)) expect(BLOCK_TYPES).toContain(b.type)
      expect(pageContentSchema.safeParse(t.content).success).toBe(true)
    })

    it('content_text gains the heading only — the live blocks add nothing (FR-1307)', () => {
      const text = extractContentText(t.content)
      expect(text).toContain(SECTION)
      const withoutBlocks = t.content.filter((b) => b.type !== 'taskView' && b.type !== 'projectWorkload')
      expect(text).toBe(extractContentText(withoutBlocks))
      expect(text).not.toContain('BOARD')
    })

    it('meeting and SOP templates have no live block', () => {
      for (const other of [meetingTemplate('30 ก.ย. 2569'), sopTemplate()])
        for (const b of walk(other.content)) expect(['taskView', 'projectWorkload']).not.toContain(b.type)
    })
  })
})
