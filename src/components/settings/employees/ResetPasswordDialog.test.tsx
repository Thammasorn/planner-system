import { screen, waitForElementToBeRemoved, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { EmployeeRow } from '@/lib/contracts/users'
import { renderWithProviders } from '../../../../tests/helpers/render'
import { ResetPasswordDialog } from './ResetPasswordDialog'

const mocks = vi.hoisted(() => ({
  resetEmployeePassword: vi.fn<(i: { userId: string; password: string }) => Promise<unknown>>(),
}))
vi.mock('@/server/actions/employees', () => ({ resetEmployeePassword: mocks.resetEmployeePassword }))

const employee: EmployeeRow = {
  id: 'c1b2c3d4-0000-4000-8000-000000000003',
  name: 'Ploy Test',
  nickname: 'Ploy',
  displayName: 'Ploy',
  email: 'ploy@example.com',
  role: 'worker',
  positionId: null,
  positionName: null,
  color: '#2F5597',
  active: true,
  deactivatedOn: null,
  mustChangePassword: false,
  schedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday: weekday as 1, fractionCd: 100 })),
}

function Harness() {
  const [target, setTarget] = useState<EmployeeRow | null>(null)
  return (
    <>
      <button onClick={() => setTarget(employee)}>open</button>
      <ResetPasswordDialog employee={target} onClose={() => setTarget(null)} />
    </>
  )
}

beforeEach(() => {
  mocks.resetEmployeePassword.mockReset()
})

describe('ResetPasswordDialog', () => {
  it('U-RESET-01 Esc and ยกเลิก cannot close the dialog while the reset is in flight; the password step still shows', async () => {
    const user = userEvent.setup()
    let resolve: (v: unknown) => void = () => {}
    mocks.resetEmployeePassword.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    renderWithProviders(<Harness />)
    await user.click(screen.getByRole('button', { name: 'open' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(th.account.newPassword, { exact: false }), 'Kx7#mPq2vR9w')
    await user.click(within(dialog).getByRole('button', { name: th.employees.actions.resetPassword }))
    expect(await within(dialog).findByRole('button', { name: th.common.saving })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: th.common.cancel })).toBeDisabled()
    expect(mocks.resetEmployeePassword).toHaveBeenCalledWith({ userId: employee.id, password: 'Kx7#mPq2vR9w' })

    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    resolve({ ok: true })
    expect(await within(dialog).findByText(th.employees.passwordShownOnce)).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue('Kx7#mPq2vR9w')).toHaveAttribute('readonly')

    expect(within(dialog).getByRole('button', { name: th.employees.copyPassword })).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
  })
})
