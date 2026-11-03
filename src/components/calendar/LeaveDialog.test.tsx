import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { getJson } from '@/lib/api'
import { qk, qkPrefix } from '@/lib/query-keys'
import type { TimeOffImpact } from '@/lib/contracts/time-off'
import { formatLeaveRange, formatThaiDate } from '@/lib/format'
import { LeaveDialog } from './LeaveDialog'
import type { LeaveDialogArgs } from './LeaveDialogProvider'
import { dateInputs, renderCalendarUi } from './render.test.helper'
import { IDS, MANAGER_USER, SICK, VACATION, WORKER_USER, full } from './test-data.test.helper'

const a = vi.hoisted(() => ({
  createTimeOff: vi.fn<(i: unknown) => Promise<unknown>>(),
  updateTimeOff: vi.fn<(i: unknown) => Promise<unknown>>(),
  deleteTimeOff: vi.fn<(i: unknown) => Promise<unknown>>(),
  restoreTimeOff: vi.fn<(i: unknown) => Promise<unknown>>(),
}))
vi.mock('@/server/actions/time-off', () => a)
vi.mock('@/lib/api', () => ({ getJson: vi.fn(() => new Promise(() => {})) }))

const BATCH = '5b1c2c38-5a8e-4a6c-9a0e-00000000b001'
const impact = (weeks: TimeOffImpact['weeks']): TimeOffImpact => ({
  userId: IDS.peter,
  userName: 'Peter',
  weeks,
  overloads: [],
  onTimeOffDays: [],
})

beforeEach(() => {
  for (const m of Object.values(a)) m.mockReset()
})

/** Closes like the provider does, so the page (and its toasts) leave the modal's aria-hidden state. */
function Harness({ args, onClose }: { args: LeaveDialogArgs; onClose: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <LeaveDialog
      args={args}
      open={open}
      onClose={() => {
        onClose()
        setOpen(false)
      }}
    />
  )
}

function setup(args: LeaveDialogArgs, user = WORKER_USER, opts: { typesLoaded?: boolean } = {}) {
  const onClose = vi.fn()
  const utils = renderCalendarUi(<Harness args={args} onClose={onClose} />, {
    user,
    ...(opts.typesLoaded === false ? { seed: (qc) => qc.removeQueries({ queryKey: qk.leaveTypes() }) } : {}),
  })
  const dialog = screen.getByRole('dialog', {
    name: args.mode === 'edit' ? th.timeOff.dialog.titleEdit : th.timeOff.dialog.titleCreate,
  })
  return { ...utils, onClose, dialog }
}

const pickers = (dialog: HTMLElement) =>
  dateInputs(dialog).filter((i) => i.closest('.MuiPickersTextField-root') !== null)
const toggle = (dialog: HTMLElement, name: string) => within(dialog).getByRole('button', { name })

describe('LeaveDialog (FR-903/905/906, M5-D6/D14)', () => {
  it('create with 10-05..10-06 shows both dates (B.E.), the first type and เต็มวัน; AM/PM are disabled', () => {
    const { dialog } = setup({ mode: 'create', startDate: '2026-10-05', endDate: '2026-10-06' })
    const [start, end] = pickers(dialog)
    expect(start).toHaveValue('05/10/2569')
    expect(end).toHaveValue('06/10/2569')
    expect(within(dialog).getByRole('combobox', { name: th.timeOff.dialog.type })).toHaveTextContent(
      VACATION.name,
    )
    expect(toggle(dialog, th.timeOff.dialog.full)).toHaveAttribute('aria-pressed', 'true')
    expect(toggle(dialog, th.timeOff.dialog.am)).toBeDisabled()
    expect(toggle(dialog, th.timeOff.dialog.pm)).toBeDisabled()
    expect(within(dialog).getByText(th.timeOff.dialog.halfOnlySingleDay)).toBeInTheDocument()
  })

  it('setting end = start enables the half days; a multi-day range resets to เต็มวัน', async () => {
    const user = userEvent.setup()
    const { dialog } = setup({ mode: 'create', startDate: '2026-10-05', endDate: '2026-10-06' })
    const [, end] = pickers(dialog)
    fireEvent.change(end!, { target: { value: '05/10/2569' } })
    expect(toggle(dialog, th.timeOff.dialog.am)).toBeEnabled()
    await user.click(toggle(dialog, th.timeOff.dialog.am))
    expect(toggle(dialog, th.timeOff.dialog.am)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(pickers(dialog)[1]!, { target: { value: '07/10/2569' } })
    expect(toggle(dialog, th.timeOff.dialog.full)).toHaveAttribute('aria-pressed', 'true')
    expect(toggle(dialog, th.timeOff.dialog.am)).toBeDisabled()
  })

  it('defaults to today for a bare "แจ้งลา"', () => {
    const { dialog } = setup({ mode: 'create' })
    const [start, end] = pickers(dialog)
    expect(start).toHaveValue('30/09/2569')
    expect(end).toHaveValue('30/09/2569')
    expect(toggle(dialog, th.timeOff.dialog.am)).toBeEnabled()
  })

  it('end before start shows endBeforeStart and calls no action', async () => {
    const user = userEvent.setup()
    const { dialog } = setup({ mode: 'create', startDate: '2026-10-05', endDate: '2026-10-06' })
    fireEvent.change(pickers(dialog)[1]!, { target: { value: '04/10/2569' } })
    await user.click(within(dialog).getByRole('button', { name: th.timeOff.dialog.save }))
    expect(await within(dialog).findByText(th.timeOff.errors.endBeforeStart)).toBeInTheDocument()
    expect(a.createTimeOff).not.toHaveBeenCalled()
  })

  it('OVERLAP renders the server message in an alert and keeps the dialog open', async () => {
    const user = userEvent.setup()
    const message = th.timeOff.errors.overlap(
      formatLeaveRange('2026-10-05', '2026-10-06', null),
      VACATION.name,
    )
    a.createTimeOff.mockResolvedValue({ ok: false, code: 'OVERLAP', message })
    const { dialog, onClose } = setup({ mode: 'create', startDate: '2026-10-06', endDate: '2026-10-07' })
    await user.click(within(dialog).getByRole('button', { name: th.timeOff.dialog.save }))
    expect(a.createTimeOff).toHaveBeenCalledWith({
      leaveTypeId: VACATION.id,
      startDate: '2026-10-06',
      endDate: '2026-10-07',
      half: null,
      note: '',
    })
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    expect(onClose).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('button', { name: th.timeOff.dialog.save })).toBeEnabled()
  })

  it('success renders "บันทึกวันลาแล้ว" and "สัปดาห์ 5 ต.ค. 2569: 5.00 → 3.00 วัน" with one ปิด button', async () => {
    const user = userEvent.setup()
    a.createTimeOff.mockResolvedValue({
      ok: true,
      id: '7a1c2c38-5a8e-4a6c-9a0e-0000000000aa',
      impact: impact([{ weekStart: '2026-10-05', beforeCd: 500, afterCd: 300 }]),
    })
    const { dialog, onClose } = setup({ mode: 'create', startDate: '2026-10-05', endDate: '2026-10-06' })
    await user.click(within(dialog).getByRole('button', { name: th.timeOff.dialog.save }))
    expect(await within(dialog).findByText(th.timeOff.dialog.saved)).toBeInTheDocument()
    expect(
      within(dialog).getByText(th.capacity.impactLine(formatThaiDate('2026-10-05'), '5.00', '3.00')),
    ).toBeInTheDocument()
    const buttons = within(dialog).getAllByRole('button')
    expect(buttons).toHaveLength(1)
    await user.click(buttons[0]!)
    expect(onClose).toHaveBeenCalled()
  })

  it('a successful save invalidates the load views (grid footer capacity, X18 / M6 S4.5)', async () => {
    const user = userEvent.setup()
    a.createTimeOff.mockResolvedValue({
      ok: true,
      id: '7a1c2c38-5a8e-4a6c-9a0e-0000000000ab',
      impact: impact([{ weekStart: '2026-10-05', beforeCd: 500, afterCd: 300 }]),
    })
    const { dialog, qc } = setup({ mode: 'create', startDate: '2026-10-05', endDate: '2026-10-06' })
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await user.click(within(dialog).getByRole('button', { name: th.timeOff.dialog.save }))
    expect(await within(dialog).findByText(th.timeOff.dialog.saved)).toBeInTheDocument()
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: qkPrefix.grid }))
  })

  it('an impact with no changed week renders noImpact; the chosen type, half and note are sent', async () => {
    const user = userEvent.setup()
    a.createTimeOff.mockResolvedValue({
      ok: true,
      id: '7a1c2c38-5a8e-4a6c-9a0e-0000000000ab',
      impact: impact([{ weekStart: '2026-10-19', beforeCd: 400, afterCd: 400 }]),
    })
    const { dialog } = setup({ mode: 'create', startDate: '2026-10-23', endDate: '2026-10-23' })
    await user.click(toggle(dialog, th.timeOff.dialog.pm))
    await user.click(within(dialog).getByRole('combobox', { name: th.timeOff.dialog.type }))
    await user.click(await screen.findByRole('option', { name: SICK.name }))
    await user.type(within(dialog).getByRole('textbox', { name: th.timeOff.dialog.note }), 'หาหมอ')
    await user.click(within(dialog).getByRole('button', { name: th.timeOff.dialog.save }))
    expect(a.createTimeOff).toHaveBeenCalledWith({
      leaveTypeId: SICK.id,
      startDate: '2026-10-23',
      endDate: '2026-10-23',
      half: 'PM',
      note: 'หาหมอ',
    })
    expect(await within(dialog).findByText(th.capacity.noImpact)).toBeInTheDocument()
  })

  it('a worker sees no employee field; a manager does (default self) and can record for someone else', async () => {
    const user = userEvent.setup()
    const first = setup({ mode: 'create', startDate: '2026-10-15', endDate: '2026-10-16' })
    expect(within(first.dialog).queryByRole('combobox', { name: th.timeOff.dialog.employee })).toBeNull()
    first.unmount()

    a.createTimeOff.mockResolvedValue({ ok: true, id: 'x', impact: impact([]) })
    const { dialog } = setup({ mode: 'create', startDate: '2026-10-15', endDate: '2026-10-16' }, MANAGER_USER)
    const employee = within(dialog).getByRole('combobox', { name: th.timeOff.dialog.employee })
    expect(employee).toHaveValue('Manager')
    await user.clear(employee)
    await user.type(employee, 'Pete')
    await user.click(await screen.findByRole('option', { name: /Peter/ }))
    await user.click(within(dialog).getByRole('button', { name: th.timeOff.dialog.save }))
    expect(a.createTimeOff).toHaveBeenCalledWith(expect.objectContaining({ userId: IDS.peter }))
  })

  it('edit mode: fields come from the entry, the employee is fixed, save calls updateTimeOff', async () => {
    const user = userEvent.setup()
    const entry = full(IDS.peter, '2026-10-08', '2026-10-08', { half: 'AM', note: 'ธุระ' })
    a.updateTimeOff.mockResolvedValue({ ok: true, id: entry.id, impact: impact([]) })
    const { dialog } = setup({ mode: 'edit', entry }, MANAGER_USER)
    expect(within(dialog).getByRole('textbox', { name: th.timeOff.dialog.employee })).toBeDisabled()
    expect(within(dialog).getByRole('textbox', { name: th.timeOff.dialog.employee })).toHaveValue('Peter')
    expect(toggle(dialog, th.timeOff.dialog.am)).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByRole('textbox', { name: th.timeOff.dialog.note })).toHaveValue('ธุระ')
    await user.click(within(dialog).getByRole('button', { name: th.timeOff.dialog.save }))
    expect(a.updateTimeOff).toHaveBeenCalledWith({
      id: entry.id,
      leaveTypeId: VACATION.id,
      startDate: '2026-10-08',
      endDate: '2026-10-08',
      half: 'AM',
      note: 'ธุระ',
    })
  })

  it('edit with an archived type keeps it as an option labelled "(ซ่อนแล้ว)"', () => {
    const entry = full(IDS.peter, '2026-10-12', '2026-10-12', {
      leaveTypeId: '0b6f7c1e-1111-4a6c-9a0e-000000000009',
      leaveTypeName: 'ลาเก่า',
      leaveTypeArchived: true,
    })
    const { dialog } = setup({ mode: 'edit', entry })
    expect(within(dialog).getByRole('combobox', { name: th.timeOff.dialog.type })).toHaveTextContent(
      th.timeOff.dialog.archivedType('ลาเก่า'),
    )
  })

  it('ลบวันลา (no confirm) deletes, closes and pushes an undo entry whose undo calls restoreTimeOff({ batch })', async () => {
    const user = userEvent.setup()
    const entry = full(IDS.peter, '2026-10-05', '2026-10-06')
    a.deleteTimeOff.mockResolvedValue({
      ok: true,
      batch: BATCH,
      userId: IDS.peter,
      startDate: '2026-10-05',
      endDate: '2026-10-06',
      half: null,
    })
    a.restoreTimeOff.mockResolvedValue({ ok: true, restored: 1, userId: IDS.peter })
    const { dialog, onClose } = setup({ mode: 'edit', entry })
    await user.click(within(dialog).getByRole('button', { name: th.timeOff.dialog.delete }))
    expect(a.deleteTimeOff).toHaveBeenCalledWith({ id: entry.id })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const message = th.timeOff.deleted(formatLeaveRange('2026-10-05', '2026-10-06', null))
    expect(await screen.findByText(message)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: th.undo.undo }))
    await waitFor(() => expect(a.restoreTimeOff).toHaveBeenCalledWith({ batch: BATCH }))
  })

  it('a failing undo (restoreOverlap) shows the Thai error toast', async () => {
    const user = userEvent.setup()
    const entry = full(IDS.peter, '2026-10-05')
    a.deleteTimeOff.mockResolvedValue({
      ok: true,
      batch: BATCH,
      userId: IDS.peter,
      startDate: '2026-10-05',
      endDate: '2026-10-05',
      half: null,
    })
    a.restoreTimeOff.mockResolvedValue({
      ok: false,
      code: 'OVERLAP',
      message: th.timeOff.errors.restoreOverlap,
    })
    const { dialog } = setup({ mode: 'edit', entry })
    await user.click(within(dialog).getByRole('button', { name: th.timeOff.dialog.delete }))
    await user.click(await screen.findByRole('button', { name: th.undo.undo }))
    expect(await screen.findByText(th.timeOff.errors.restoreOverlap)).toBeInTheDocument()
  })

  it('the dialog opens focused on its surface; Enter there saves the pre-filled range (P1, FR-908)', async () => {
    const user = userEvent.setup()
    a.createTimeOff.mockResolvedValue({ ok: true, id: 'x', impact: impact([]) })
    const { dialog } = setup({ mode: 'create', startDate: '2026-10-26', endDate: '2026-10-27' })
    expect(dialog).toHaveFocus() // MUI's focus target, outside the <form>
    await user.keyboard('{Enter}')
    expect(a.createTimeOff).toHaveBeenCalledTimes(1)
    expect(a.createTimeOff).toHaveBeenCalledWith({
      leaveTypeId: VACATION.id,
      startDate: '2026-10-26',
      endDate: '2026-10-27',
      half: null,
      note: '',
    })
    expect(await within(dialog).findByText(th.timeOff.dialog.saved)).toBeInTheDocument()
  })

  it('Enter on a dialog button is left to the button (no extra submit)', async () => {
    const user = userEvent.setup()
    const { dialog, onClose } = setup({ mode: 'create', startDate: '2026-10-26', endDate: '2026-10-26' })
    within(dialog).getByRole('button', { name: th.timeOff.dialog.cancel }).focus()
    await user.keyboard('{Enter}')
    expect(onClose).toHaveBeenCalled()
    expect(a.createTimeOff).not.toHaveBeenCalled()
  })

  it('while the leave types load the type select is disabled with a loading hint and saving is blocked', async () => {
    const user = userEvent.setup()
    const { dialog } = setup({ mode: 'create', startDate: '2026-10-05' }, WORKER_USER, { typesLoaded: false })
    expect(within(dialog).getByText(th.timeOff.dialog.typesLoading)).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: th.timeOff.dialog.type })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(within(dialog).getByRole('button', { name: th.timeOff.dialog.save })).toBeDisabled()
    dialog.focus()
    await user.keyboard('{Enter}')
    expect(a.createTimeOff).not.toHaveBeenCalled()
    expect(within(dialog).queryByText(th.timeOff.errors.typeRequired)).toBeNull()
  })

  it('a failed leave-type load shows an error with a retry that refetches and then allows saving', async () => {
    const user = userEvent.setup()
    const load = vi.mocked(getJson)
    load.mockRejectedValueOnce(new Error('boom'))
    const { dialog } = setup({ mode: 'create', startDate: '2026-10-05' }, WORKER_USER, { typesLoaded: false })
    expect(await within(dialog).findByText(th.timeOff.dialog.typesLoadError)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: th.timeOff.dialog.save })).toBeDisabled()
    load.mockResolvedValueOnce({ leaveTypes: [VACATION, SICK] })
    await user.click(within(dialog).getByRole('button', { name: th.common.retry }))
    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: th.timeOff.dialog.type })).toHaveTextContent(
        VACATION.name,
      ),
    )
    expect(within(dialog).queryByText(th.timeOff.dialog.typesLoadError)).toBeNull()
    expect(within(dialog).getByRole('button', { name: th.timeOff.dialog.save })).toBeEnabled()
  })

  it('an edit can still be saved while the type list is unavailable (its own type is kept)', () => {
    const entry = full(IDS.peter, '2026-10-08')
    const { dialog } = setup({ mode: 'edit', entry }, WORKER_USER, { typesLoaded: false })
    expect(within(dialog).getByRole('button', { name: th.timeOff.dialog.save })).toBeEnabled()
  })
})
