import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToasterHost } from '@/components/providers/ToasterHost'
import { UndoProvider } from '@/components/undo/UndoProvider'
import { th } from '@/i18n/th'
import type { EmployeeRow, PositionRow } from '@/lib/contracts/users'
import { renderWithProviders } from '../../../../tests/helpers/render'
import { EmployeesTable } from './EmployeesTable'

const mocks = vi.hoisted(() => ({
  deactivateEmployee: vi.fn<(i: { userId: string }) => Promise<unknown>>(),
  reactivateEmployee: vi.fn<(i: { userId: string }) => Promise<unknown>>(),
}))
vi.mock('@/server/actions/employees', () => ({
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  resetEmployeePassword: vi.fn(),
  deactivateEmployee: mocks.deactivateEmployee,
  reactivateEmployee: mocks.reactivateEmployee,
}))

const DES = 'a1b2c3d4-0000-4000-8000-000000000002'
const positions: PositionRow[] = [{ id: DES, name: 'Designer', position: 'a1', userCount: 1 }]

function row(id: string, name: string, nickname: string | null, p: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    id,
    name,
    nickname,
    displayName: nickname ?? name,
    email: `${(nickname ?? name).toLowerCase()}@example.com`,
    role: 'worker',
    positionId: null,
    positionName: null,
    color: null,
    active: true,
    deactivatedOn: null,
    mustChangePassword: false,
    schedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday: weekday as 1, fractionCd: 100 })),
    ...p,
  }
}

const ME = 'c0000000-0000-4000-8000-000000000001'
const CINDY = 'c0000000-0000-4000-8000-000000000002'
const rows: EmployeeRow[] = [
  row(ME, 'Demo Manager', 'Manager', { role: 'manager' }),
  row(CINDY, 'Cindy C.', 'Cindy', {
    positionId: DES,
    positionName: 'Designer',
    schedule: [
      { weekday: 1, fractionCd: 100 },
      { weekday: 3, fractionCd: 50 },
    ],
  }),
]

function setup(list = rows) {
  return renderWithProviders(
    <UndoProvider>
      <EmployeesTable rows={list} positions={positions} currentUserId={ME} />
      <ToasterHost />
    </UndoProvider>,
  )
}

const rowOf = (name: string) => screen.getByRole('row', { name: new RegExp(name) })

beforeAll(() => {
  // jsdom lacks pointer capture; sonner calls it when a toast is pressed.
  Element.prototype.setPointerCapture ??= () => {}
})
afterEach(() => {
  toast.dismiss() // sonner keeps toasts in a module-level store between tests
})
beforeEach(() => {
  mocks.deactivateEmployee.mockReset()
  mocks.reactivateEmployee.mockReset()
  mocks.deactivateEmployee.mockResolvedValue({ ok: true })
  mocks.reactivateEmployee.mockResolvedValue({ ok: true })
})

describe('EmployeesTable', () => {
  it('U-EMPT-01 deactivate is immediate with an undo toast; เลิกทำ reactivates (no confirm dialog)', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(within(rowOf('Cindy')).getByRole('button', { name: th.common.actions }))
    await user.click(await screen.findByRole('menuitem', { name: th.employees.actions.deactivate }))
    expect(mocks.deactivateEmployee).toHaveBeenCalledWith({ userId: CINDY })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText(th.employees.deactivated('Cindy'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.undo.undo }))
    await vi.waitFor(() => expect(mocks.reactivateEmployee).toHaveBeenCalledWith({ userId: CINDY }))
  })

  it('U-EMPT-02 LAST_MANAGER / SELF_DEACTIVATE show the server message and push nothing', async () => {
    const user = userEvent.setup()
    mocks.deactivateEmployee.mockResolvedValue({ ok: false, code: 'LAST_MANAGER', message: th.errors.LAST_MANAGER })
    setup()
    await user.click(within(rowOf('Cindy')).getByRole('button', { name: th.common.actions }))
    await user.click(await screen.findByRole('menuitem', { name: th.employees.actions.deactivate }))
    expect(await screen.findByText(th.errors.LAST_MANAGER)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: th.undo.undo })).not.toBeInTheDocument()
  })

  it('U-EMPT-03 own row: "คุณ" chip, no deactivate and no reset password', async () => {
    const user = userEvent.setup()
    setup()
    const mine = rowOf('Manager')
    expect(within(mine).getByText(th.employees.you)).toBeInTheDocument()
    await user.click(within(mine).getByRole('button', { name: th.common.actions }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: th.employees.actions.edit })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: th.employees.actions.deactivate })).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: th.employees.actions.resetPassword })).toBeNull()
  })

  it('U-EMPT-04 status chips carry text + icon; schedule summary; deactivated rows offer reactivate', async () => {
    const user = userEvent.setup()
    setup([rows[0]!, { ...rows[1]!, active: false, deactivatedOn: '2026-09-30' }])
    const cindy = rowOf('Cindy')
    expect(within(cindy).getByText(th.employees.status.deactivated)).toBeInTheDocument()
    expect(within(cindy).getByText(`Cindy ${th.users.deactivatedSuffix}`)).toBeInTheDocument()
    expect(within(cindy).getByText('จ พ(0.50)')).toBeInTheDocument()
    expect(within(rowOf('Manager')).getByText(th.employees.status.active)).toBeInTheDocument()
    await user.click(within(cindy).getByRole('button', { name: th.common.actions }))
    await user.click(await screen.findByRole('menuitem', { name: th.employees.actions.reactivate }))
    expect(mocks.reactivateEmployee).toHaveBeenCalledWith({ userId: CINDY })
    expect(await screen.findByText(th.employees.reactivated('Cindy'))).toBeInTheDocument()
  })

  it('U-EMPT-05 search / position / status filters and the no-match empty state (FR-209)', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByRole('searchbox', { name: th.employees.filters.search }), 'cindy')
    expect(screen.queryByRole('row', { name: /Manager/ })).toBeNull()
    expect(rowOf('Cindy')).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: th.employees.filters.search }))
    await user.selectOptions(screen.getByRole('combobox', { name: th.employees.filters.position }), 'Designer')
    expect(screen.queryByRole('row', { name: /Manager/ })).toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: th.employees.filters.position }), th.employees.filters.allPositions)
    await user.selectOptions(
      screen.getByRole('combobox', { name: th.employees.filters.status }),
      th.employees.status.deactivated,
    )
    expect(screen.getByText(th.employees.noMatch)).toBeInTheDocument()
  })
})
