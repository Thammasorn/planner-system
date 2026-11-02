// src/i18n/templates.th.ts — page templates of SPEC Appendix B (TPL-B1…B3, FR-402/507, M4-D6/D7/D8) as BlockNote
// PARTIAL blocks (string content, string table cells, no ids); BlockNote assigns ids on first load.
// M10 (FR-1305, M10-D12, X78): the v3.1 section "งานและภาระของทีม" (h2 + the taskView / projectWorkload live blocks)
// follows "Milestones สำคัญ". Charters created before M10 are not migrated (M4-D30).
import type { TemplateBlock } from '@/lib/contracts/pages'
import { th } from './th'

export type TemplateId = 'charter' | 'meeting' | 'sop'

export interface TemplateResult {
  title: string
  icon: string
  content: TemplateBlock[]
}

/** Values the auto-created charter pre-fills (M4-D6); missing → blank cell. */
export interface CharterFill {
  clientName?: string | null
  leadName?: string | null
  certaintyLabel?: string | null
}

const h2 = (text: string): TemplateBlock => ({ type: 'heading', props: { level: 2 }, content: text })
const h3 = (text: string): TemplateBlock => ({ type: 'heading', props: { level: 3 }, content: text })
const p = (text?: string): TemplateBlock =>
  text ? { type: 'paragraph', content: text } : { type: 'paragraph' }
const quote = (text: string): TemplateBlock => ({ type: 'quote', content: text })
const check = (text: string): TemplateBlock => ({ type: 'checkListItem', content: text })
const bullet = (text?: string): TemplateBlock =>
  text ? { type: 'bulletListItem', content: text } : { type: 'bulletListItem' }
const numbered = (): TemplateBlock => ({ type: 'numberedListItem' })

/**
 * The one table-block builder every template uses (C68): first row = header (`headerRows: 1`), cells are plain
 * strings. Exported so M11's demo content (`scripts/lib/demo-content.ts`) imports it instead of re-implementing it.
 */
export function tableBlock(rows: readonly (readonly string[])[]): TemplateBlock {
  return {
    type: 'table',
    content: { type: 'tableContent', headerRows: 1, rows: rows.map((cells) => ({ cells: [...cells] })) },
  }
}

/** B.1 — title 'Project Charter', icon 📋. */
export function charterTemplate(fill: CharterFill = {}): TemplateResult {
  return {
    title: th.pages.charterTitle,
    icon: '📋',
    content: [
      quote('สรุปโปรเจคในหนึ่งย่อหน้า: ทำอะไร ให้ใคร เพื่ออะไร'),
      h2('ข้อมูลโปรเจค'),
      tableBlock([
        ['หัวข้อ', 'รายละเอียด'],
        ['ลูกค้า', fill.clientName ?? ''],
        ['Project Lead', fill.leadName ?? ''],
        ['ช่วงเวลา', ''],
        ['ความแน่นอน', fill.certaintyLabel ?? ''],
      ]),
      h2('ที่มาและปัญหา'),
      p(),
      h2('วัตถุประสงค์'),
      check('…'),
      h2('ขอบเขตงาน'),
      h3('อยู่ในขอบเขต'),
      p(),
      h3('ไม่อยู่ในขอบเขต'),
      p(),
      h2('ผลลัพธ์ที่ส่งมอบ'),
      tableBlock([
        ['ส่งมอบ', 'รายละเอียด', 'กำหนดส่ง'],
        ['', '', ''],
      ]),
      h2('Milestones สำคัญ'),
      p('(ดูและแก้ที่แท็บภาพรวม — Phase 2 จะฝังรายการสดไว้ตรงนี้)'),
      // M10 (FR-1305, App. B.1, M10-D12): live blocks bound to the page's project — view config only
      h2('งานและภาระของทีม'),
      { type: 'taskView', props: { view: 'BOARD' } },
      { type: 'projectWorkload', props: {} },
      h2('ทีมงานและบทบาท'),
      tableBlock([
        ['ชื่อ', 'บทบาทในโปรเจค', 'ความรับผิดชอบ'],
        ['', '', ''],
      ]),
      h2('ผู้มีส่วนได้ส่วนเสีย'),
      tableBlock([
        ['ชื่อ / หน่วยงาน', 'บทบาท', 'ความคาดหวัง', 'ช่องทางติดต่อ'],
        ['', '', '', ''],
      ]),
      h2('ความเสี่ยงและข้อสมมติฐาน'),
      tableBlock([
        ['ความเสี่ยง', 'โอกาส', 'ผลกระทบ', 'แนวทางรับมือ'],
        ['', '', '', ''],
      ]),
      h2('เกณฑ์ความสำเร็จ'),
      check('…'),
      h2('การสื่อสาร'),
      bullet('ประชุมประจำ:'),
      bullet('ช่องทางหลัก:'),
    ],
  }
}

/** B.2 — title th.pages.meetingTitle(dateLabel), icon 📝; `dateLabel` = formatThaiDate(serverToday(), 'medium'). */
export function meetingTemplate(dateLabel: string): TemplateResult {
  return {
    title: th.pages.meetingTitle(dateLabel),
    icon: '📝',
    content: [
      tableBlock([
        ['วันที่', 'ผู้เข้าร่วม', 'ผู้จด'],
        [dateLabel, '', ''],
      ]),
      h2('วาระ'),
      numbered(),
      h2('สรุปการหารือ'),
      p(),
      h2('สิ่งที่ตัดสินใจ'),
      bullet(),
      h2('Action items'),
      check('… — @ผู้รับผิดชอบ — กำหนด'),
    ],
  }
}

/** B.3 — title '' (the title field gets focus), icon 📘. */
export function sopTemplate(): TemplateResult {
  return {
    title: '',
    icon: '📘',
    content: [
      quote('ใช้เมื่อไหร่ · ใครเป็นเจ้าของขั้นตอนนี้ · แก้ไขล่าสุดเมื่อ'),
      h2('ก่อนเริ่ม'),
      check('สิ่งที่ต้องเตรียม'),
      h2('ขั้นตอน'),
      numbered(),
      h2('ข้อควรระวัง'),
      p(),
      h2('คำถามที่พบบ่อย'),
      p(),
    ],
  }
}

/** Template chosen on a blank page (FR-507); the charter here has blank cells (M4-D6). */
export function buildTemplate(id: TemplateId, ctx: { dateLabel: string }): TemplateResult {
  switch (id) {
    case 'charter':
      return charterTemplate()
    case 'meeting':
      return meetingTemplate(ctx.dateLabel)
    case 'sop':
      return sopTemplate()
  }
}
