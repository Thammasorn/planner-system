import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderCalendarUi } from '@/components/calendar/render.test.helper'
import { th } from '@/i18n/th'
import type { HolidayDTO } from '@/lib/contracts/holidays'
import { HolidayImportDialog } from './HolidayImportDialog'

const m = vi.hoisted(() => ({ importHolidays: vi.fn<(i: unknown) => Promise<unknown>>() }))
vi.mock('@/server/actions/holidays', () => m)

const t = th.holidays.import
const utf8 = (s: string) => new TextEncoder().encode(s)
const csv = (text: string, name = 'holidays.csv') => new File([utf8(text)], name, { type: 'text/csv' })

async function openAndUpload(file: File, existing: HolidayDTO[] = []) {
  const user = userEvent.setup()
  renderCalendarUi(<HolidayImportDialog existing={existing} />)
  await user.click(screen.getByRole('button', { name: t.button }))
  const dialog = await screen.findByRole('dialog', { name: t.title })
  await user.upload(within(dialog).getByLabelText(t.chooseFile), file)
  return { user, dialog }
}

beforeEach(() => {
  m.importHolidays.mockReset()
  m.importHolidays.mockResolvedValue({ ok: true, inserted: 2, updated: 0, unchanged: 0 })
})

describe('HolidayImportDialog (FR-901, M5-D11)', () => {
  it('a UTF-8 (BOM) file with 2 rows → preview 2 × ใหม่ and "นำเข้า 2 รายการ"; confirm sends exactly the parsed rows', async () => {
    const { user, dialog } = await openAndUpload(
      csv('﻿date,name\r\n2026-10-23,วันหยุดสมมติสำหรับทดสอบ\r\n2026-12-31,วันสิ้นปี\r\n'),
    )
    expect(await within(dialog).findByText(t.previewTitle(2))).toBeInTheDocument()
    expect(within(dialog).getAllByText(t.status.new)).toHaveLength(2)
    const confirm = within(dialog).getByRole('button', { name: t.confirm(2) })
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(m.importHolidays).toHaveBeenCalledWith({
      rows: [
        { date: '2026-10-23', name: 'วันหยุดสมมติสำหรับทดสอบ' },
        { date: '2026-12-31', name: 'วันสิ้นปี' },
      ],
    })
    expect(await screen.findByText(t.done(2, 0))).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('a bad line → "บรรทัด 1: …" and the confirm button is disabled', async () => {
    const { dialog } = await openAndUpload(csv('23/10/2569,x\n'))
    expect(await within(dialog).findByText(t.errorsTitle(1))).toBeInTheDocument()
    expect(within(dialog).getByText(t.errors.line(1, t.errors.badDate('23/10/2569')))).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: t.confirm(0) })).toBeDisabled()
  })

  it('an error anywhere disables the import even when other rows are valid', async () => {
    const { dialog } = await openAndUpload(csv('2026-10-23,ok\n2026-10-23,dup\n'))
    expect(
      await within(dialog).findByText(t.errors.line(2, t.errors.duplicate('2026-10-23', 1))),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: t.confirm(1) })).toBeDisabled()
  })

  it('an existing date → อัปเดตชื่อ + "เดิม: …"; an identical one → ไม่เปลี่ยน', async () => {
    const existing: HolidayDTO[] = [
      { id: '1f1c2c38-5a8e-4a6c-9a0e-000000000001', date: '2026-12-31', name: 'วันสิ้นปี' },
      { id: '1f1c2c38-5a8e-4a6c-9a0e-000000000002', date: '2026-10-23', name: 'วันปิยมหาราช' },
    ]
    const { dialog } = await openAndUpload(
      csv('2026-12-31,วันสิ้นปีเก่า\n2026-12-30,วันหยุดพิเศษ\n2026-10-23,วันปิยมหาราช\n'),
      existing,
    )
    const rows = await within(dialog).findAllByRole('row')
    const body = rows.slice(1)
    expect(within(body[0]!).getByText(t.status.update)).toBeInTheDocument()
    expect(within(body[0]!).getByText(t.previousName('วันสิ้นปี'))).toBeInTheDocument()
    expect(within(body[1]!).getByText(t.status.new)).toBeInTheDocument()
    expect(within(body[2]!).getByText(t.status.same)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: t.confirm(3) })).toBeEnabled()
  })

  it('an empty file shows the file error; a failed import shows the server message and keeps the dialog', async () => {
    const first = await openAndUpload(csv('\n\n'))
    expect(await within(first.dialog).findByText(t.errors.empty)).toBeInTheDocument()

    m.importHolidays.mockResolvedValue({ ok: false, code: 'VALIDATION', message: t.errors.duplicateAny })
    await first.user.upload(within(first.dialog).getByLabelText(t.chooseFile), csv('2026-10-23,x\n'))
    await first.user.click(await within(first.dialog).findByRole('button', { name: t.confirm(1) }))
    expect(await screen.findByText(t.errors.duplicateAny)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: t.title })).toBeInTheDocument()
  })
})
