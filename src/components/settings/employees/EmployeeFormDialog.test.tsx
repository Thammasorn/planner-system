import { screen, waitFor, waitForElementToBeRemoved, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { EmployeeRow, PositionRow } from '@/lib/contracts/users'
import { PASSWORD_ALPHABET } from '@/lib/random-password'
import { renderWithProviders } from '../../../../tests/helpers/render'
import { EmployeeFormDialog } from './EmployeeFormDialog'

const mocks = vi.hoisted(() => ({
  createEmployee: vi.fn<(i: unknown) => Promise<unknown>>(),
  updateEmployee: vi.fn<(i: unknown) => Promise<unknown>>(),
  copyText: vi.fn<(t: string) => Promise<boolean>>(),
}))
vi.mock('@/server/actions/employees', () => ({
  createEmployee: mocks.createEmployee,
  updateEmployee: mocks.updateEmployee,
}))
vi.mock('@/lib/copy-text', () => ({ copyText: mocks.copyText }))

const positions: PositionRow[] = [
  { id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Project Manager', position: 'a0', userCount: 1 },
  { id: 'a1b2c3d4-0000-4000-8000-000000000002', name: 'Designer', position: 'a1', userCount: 2 },
]

function Harness({ employee }: { employee?: EmployeeRow }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <EmployeeFormDialog
        open={open}
        mode={employee ? 'edit' : 'create'}
        {...(employee ? { employee } : {})}
        positions={positions}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, employee?: EmployeeRow) {
  renderWithProviders(<Harness {...(employee ? { employee } : {})} />)
  await user.click(screen.getByRole('button', { name: 'open' }))
  return screen.findByRole('dialog')
}

async function fillBasics(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.type(within(dialog).getByLabelText(th.employees.fields.name, { exact: false }), 'Ploy Test')
  await user.type(within(dialog).getByLabelText(th.employees.fields.email, { exact: false }), 'ploy@example.com')
}

const passwordField = (dialog: HTMLElement) =>
  within(dialog).getByLabelText(th.employees.fields.initialPassword, { exact: false })

beforeEach(() => {
  mocks.createEmployee.mockReset()
  mocks.updateEmployee.mockReset()
  mocks.copyText.mockReset()
  mocks.createEmployee.mockResolvedValue({ ok: true, userId: 'b1b2c3d4-0000-4000-8000-000000000009' })
  mocks.updateEmployee.mockResolvedValue({ ok: true })
  mocks.copyText.mockResolvedValue(true)
})

describe('EmployeeFormDialog', () => {
  it('U-FORM-01 an empty name shows nameRequired and does not call the action', async () => {
    const user = userEvent.setup()
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: th.common.save }))
    expect(await within(dialog).findByText(th.employees.nameRequired)).toBeInTheDocument()
    expect(mocks.createEmployee).not.toHaveBeenCalled()
  })

  it('U-FORM-02 "สุ่มรหัส" fills a 12-character password from the unambiguous alphabet', async () => {
    const user = userEvent.setup()
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: th.employees.generatePassword }))
    const value = (passwordField(dialog) as HTMLInputElement).value
    expect(value).toHaveLength(12)
    expect([...value].every((c) => PASSWORD_ALPHABET.includes(c))).toBe(true)
  })

  it('U-FORM-03 success shows the password once; reopening shows an empty form (AC-202)', async () => {
    const user = userEvent.setup()
    let dialog = await openDialog(user)
    await fillBasics(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: th.employees.generatePassword }))
    const generated = (passwordField(dialog) as HTMLInputElement).value
    await user.click(within(dialog).getByRole('button', { name: th.common.save }))

    await within(dialog).findByText(th.employees.createdTitle)
    expect(mocks.createEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Ploy Test', email: 'ploy@example.com', password: generated }),
    )
    expect(within(dialog).getByDisplayValue(generated)).toHaveAttribute('readonly')
    expect(within(dialog).getByText(th.employees.passwordShownOnce)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: th.employees.copyPassword }))
    expect(mocks.copyText).toHaveBeenCalledWith(generated)
    expect(await within(dialog).findByText(th.common.copied)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: th.common.close }))
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    expect(screen.queryByDisplayValue(generated)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'open' }))
    dialog = await screen.findByRole('dialog')
    expect((passwordField(dialog) as HTMLInputElement).value).toBe('')
    expect(within(dialog).queryByDisplayValue(generated)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(th.employees.createdTitle)).not.toBeInTheDocument()
  })

  it('U-FORM-04 a password equal to the email local part shows EQUALS_EMAIL', async () => {
    const user = userEvent.setup()
    const dialog = await openDialog(user)
    await fillBasics(user, dialog)
    await user.type(passwordField(dialog), 'ploy')
    await user.click(within(dialog).getByRole('button', { name: th.common.save }))
    expect(await within(dialog).findByText(th.account.policy.EQUALS_EMAIL)).toBeInTheDocument()
    expect(mocks.createEmployee).not.toHaveBeenCalled()
  })

  it('U-FORM-05 unticking every schedule day blocks submit with atLeastOneDay', async () => {
    const user = userEvent.setup()
    const dialog = await openDialog(user)
    await fillBasics(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: th.employees.generatePassword }))
    for (const d of [1, 2, 3, 4, 5] as const) {
      await user.click(
        within(dialog).getByRole('checkbox', {
          name: `${th.employees.schedule.works} ${th.employees.schedule.weekdayLong[d]}`,
        }),
      )
    }
    await user.click(within(dialog).getByRole('button', { name: th.common.save }))
    expect(await within(dialog).findByText(th.employees.schedule.atLeastOneDay)).toBeInTheDocument()
    expect(mocks.createEmployee).not.toHaveBeenCalled()
  })

  it('U-FORM-06 "บังคับเปลี่ยนรหัสเมื่อเข้าครั้งแรก" is checked by default (FR-203)', async () => {
    const user = userEvent.setup()
    const dialog = await openDialog(user)
    expect(within(dialog).getByRole('checkbox', { name: th.employees.fields.mustChange })).toBeChecked()
  })

  it('U-FORM-07 server fieldErrors.email shows under the email field; LAST_MANAGER as an alert', async () => {
    const user = userEvent.setup()
    mocks.createEmployee.mockResolvedValueOnce({
      ok: false,
      code: 'CONFLICT',
      message: th.employees.emailTaken,
      fieldErrors: { email: [th.employees.emailTaken] },
    })
    const dialog = await openDialog(user)
    await fillBasics(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: th.employees.generatePassword }))
    await user.click(within(dialog).getByRole('button', { name: th.common.save }))
    const email = within(dialog).getByLabelText(th.employees.fields.email, { exact: false })
    await waitFor(() => expect(email).toHaveAccessibleDescription(th.employees.emailTaken))
  })

  it('U-FORM-09 Esc and ยกเลิก cannot close the dialog while create is in flight; the password step still shows', async () => {
    const user = userEvent.setup()
    let resolve: (v: unknown) => void = () => {}
    mocks.createEmployee.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const dialog = await openDialog(user)
    await fillBasics(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: th.employees.generatePassword }))
    await user.click(within(dialog).getByRole('button', { name: th.common.save }))
    expect(await within(dialog).findByRole('button', { name: th.common.saving })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: th.common.cancel })).toBeDisabled()

    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    resolve({ ok: true, userId: 'b1b2c3d4-0000-4000-8000-000000000009' })
    expect(await within(dialog).findByText(th.employees.createdTitle)).toBeInTheDocument()
    expect(within(dialog).getByText(th.employees.passwordShownOnce)).toBeInTheDocument()

    expect(within(dialog).getByRole('button', { name: th.employees.copyPassword })).toHaveFocus()
    await user.keyboard('{Escape}') // closable again once the action settled
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
  })

  it('U-FORM-08 edit mode prefills, sends updateEmployee and shows LAST_MANAGER in the dialog', async () => {
    const user = userEvent.setup()
    const employee: EmployeeRow = {
      id: 'c1b2c3d4-0000-4000-8000-000000000003',
      name: 'Demo Manager',
      nickname: 'Manager',
      displayName: 'Manager',
      email: 'manager@example.com',
      role: 'manager',
      positionId: positions[0]!.id,
      positionName: 'Project Manager',
      color: '#2F5597',
      active: true,
      deactivatedOn: null,
      mustChangePassword: false,
      schedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday: weekday as 1, fractionCd: 100 })),
    }
    mocks.updateEmployee.mockResolvedValueOnce({ ok: false, code: 'LAST_MANAGER', message: th.errors.LAST_MANAGER })
    const dialog = await openDialog(user, employee)
    expect(within(dialog).getByLabelText(th.employees.fields.name, { exact: false })).toHaveValue('Demo Manager')
    expect(within(dialog).queryByLabelText(th.employees.fields.initialPassword, { exact: false })).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: th.common.save }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(th.errors.LAST_MANAGER)
    expect(mocks.updateEmployee).toHaveBeenCalledWith(
      expect.objectContaining({ userId: employee.id, role: 'manager', positionId: positions[0]!.id }),
    )
  })
})
