import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../../tests/helpers/render'
import { ChangePasswordForm } from './ChangePasswordForm'
import { LoginForm } from './LoginForm'
import { SignOutEverywhereButton } from './SignOutEverywhereButton'

const mocks = vi.hoisted(() => ({
  login: vi.fn<(i: unknown) => Promise<unknown>>(),
  changeOwnPassword: vi.fn<(i: unknown) => Promise<unknown>>(),
  signOutEverywhere: vi.fn<(i: unknown) => Promise<unknown>>(),
  logout: vi.fn<(i: unknown) => Promise<unknown>>(),
  navigate: vi.fn<(url: string) => void>(),
}))
vi.mock('@/server/actions/auth', () => ({
  login: mocks.login,
  changeOwnPassword: mocks.changeOwnPassword,
  signOutEverywhere: mocks.signOutEverywhere,
  logout: mocks.logout,
}))
vi.mock('./hard-navigate', () => ({ hardNavigate: mocks.navigate }))

/** Labels start with the text (MUI appends " *" to required fields); "รหัสผ่านใหม่" is inside "ยืนยันรหัสผ่านใหม่". */
const byLabel = (label: string) => screen.getByLabelText(new RegExp(`^${label}`))

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
})

describe('LoginForm', () => {
  it('U-LOGIN-01 shows the server message and never offers sign-up', async () => {
    const user = userEvent.setup()
    mocks.login.mockResolvedValue({ ok: false, code: 'INVALID_CREDENTIALS', message: th.auth.errors.INVALID_CREDENTIALS })
    renderWithProviders(<LoginForm next="/home" />)
    expect(screen.getByRole('heading', { name: th.auth.loginTitle })).toBeInTheDocument()
    expect(screen.getByText(th.auth.noSignUp)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    await user.type(byLabel(th.auth.email), ' Cindy@Example.com ')
    await user.type(byLabel(th.auth.password), 'wrong-pass')
    await user.click(screen.getByRole('button', { name: th.auth.submit }))
    expect(await screen.findByRole('alert')).toHaveTextContent(th.auth.errors.INVALID_CREDENTIALS)
    // type="email" inputs strip surrounding whitespace; the schema trims + lowercases on the server.
    expect(mocks.login).toHaveBeenCalledWith({ email: 'Cindy@Example.com', password: 'wrong-pass', next: '/home' })
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('U-LOGIN-02 success does a full navigation to redirectTo (X32, M1-D7)', async () => {
    const user = userEvent.setup()
    mocks.login.mockResolvedValue({ ok: true, redirectTo: '/settings/employees' })
    renderWithProviders(<LoginForm next="/settings/employees" />)
    await user.type(byLabel(th.auth.email), 'manager@example.com')
    await user.type(byLabel(th.auth.password), 'demo1234{Enter}')
    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/settings/employees'))
  })

  it('U-LOGIN-03 an empty password is caught on the client', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginForm next="/home" />)
    await user.type(byLabel(th.auth.email), 'cindy@example.com{Enter}')
    expect(await screen.findByText(th.auth.passwordRequired)).toBeInTheDocument()
    expect(mocks.login).not.toHaveBeenCalled()
  })
})

describe('ChangePasswordForm', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>, cur: string, next: string, confirm = next) => {
    await user.type(byLabel(th.account.currentPassword), cur)
    await user.type(byLabel(th.account.newPassword), next)
    await user.type(byLabel(th.account.confirmPassword), confirm)
    await user.click(screen.getByRole('button', { name: th.account.submit }))
  }

  it('U-ACCF-01 policy: equal to the email local part, same as current, mismatch', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ChangePasswordForm email="nok@example.com" next="/home" />)
    await fill(user, 'Start-pass-99', 'nok')
    expect(await screen.findByText(th.account.policy.EQUALS_EMAIL)).toBeInTheDocument()
    expect(screen.getByText(th.account.policy.TOO_SHORT)).toBeInTheDocument()
    expect(mocks.changeOwnPassword).not.toHaveBeenCalled()
  })

  it('U-ACCF-02 SAME_AS_CURRENT and MISMATCH', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ChangePasswordForm email="nok@example.com" next="/home" />)
    await fill(user, 'Start-pass-99', 'Start-pass-99')
    expect(await screen.findByText(th.account.policy.SAME_AS_CURRENT)).toBeInTheDocument()
    await user.clear(byLabel(th.account.newPassword))
    await user.type(byLabel(th.account.newPassword), 'Nok-pass-2026')
    await user.click(screen.getByRole('button', { name: th.account.submit }))
    expect(await screen.findByText(th.account.policy.MISMATCH)).toBeInTheDocument()
  })

  it('U-ACCF-03 INVALID_PASSWORD from the server shows under the current password; success navigates', async () => {
    const user = userEvent.setup()
    mocks.changeOwnPassword.mockResolvedValueOnce({
      ok: false,
      code: 'INVALID_PASSWORD',
      message: th.errors.INVALID_PASSWORD,
      fieldErrors: { currentPassword: [th.errors.INVALID_PASSWORD] },
    })
    renderWithProviders(<ChangePasswordForm email="nok@example.com" next="/home" />)
    await fill(user, 'wrong-current', 'Nok-pass-2026')
    const current = byLabel(th.account.currentPassword)
    await vi.waitFor(() => expect(current).toHaveAccessibleDescription(th.errors.INVALID_PASSWORD))

    mocks.changeOwnPassword.mockResolvedValueOnce({ ok: true, redirectTo: '/home' })
    // the error can render while the first submit's transition is still pending (button reads th.common.saving):
    // wait for the idle submit button instead of assuming it is already back (flaked under full-suite load)
    await user.click(await screen.findByRole('button', { name: th.account.submit }))
    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/home'))
    expect(mocks.changeOwnPassword).toHaveBeenLastCalledWith({
      currentPassword: 'wrong-current',
      newPassword: 'Nok-pass-2026',
      confirmPassword: 'Nok-pass-2026',
      next: '/home',
    })
  })
})

describe('SignOutEverywhereButton', () => {
  it('U-ACCF-04 signs out everywhere without a confirm and goes to /login', async () => {
    const user = userEvent.setup()
    mocks.signOutEverywhere.mockResolvedValue({ ok: true, redirectTo: '/login' })
    renderWithProviders(<SignOutEverywhereButton />)
    await user.click(screen.getByRole('button', { name: th.account.signOutEverywhere }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/login'))
  })
})
