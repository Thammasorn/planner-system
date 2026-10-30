import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { th } from '@/i18n/th'
import { initialOf } from '@/lib/display-name'
import { USER_COLORS, contrastRatio } from '@/lib/user-colors'
import { renderWithProviders } from '../../../tests/helpers/render'
import { INACTIVE_AVATAR_BG, UserAvatar } from './UserAvatar'
import { UserName } from './UserName'

describe('UserName / UserAvatar', () => {
  it('U-UN-01 shows the nickname and the full name + position on hover', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <UserName user={{ name: 'Demo Manager', nickname: 'Manager', positionName: 'Project Manager' }} />,
    )
    const el = screen.getByText('Manager')
    await user.hover(el)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      th.users.tooltip('Demo Manager', 'Project Manager'),
    )
    expect(th.users.tooltip('Demo Manager', 'Project Manager')).toBe('Demo Manager · Project Manager')
  })

  it('U-UN-01b falls back to the full name without a nickname', () => {
    renderWithProviders(<UserName user={{ name: 'Peter S.', nickname: null }} />)
    expect(screen.getByText('Peter S.')).toBeInTheDocument()
  })

  it('U-UN-02 inactive users carry the "(ปิดใช้งาน)" suffix (not colour only)', () => {
    renderWithProviders(<UserName user={{ name: 'Cindy C.', nickname: 'Cindy', active: false }} />)
    expect(screen.getByText(`Cindy ${th.users.deactivatedSuffix}`)).toBeInTheDocument()
  })

  it('U-UN-03 the avatar shows initialOf and the user colour, hidden from assistive tech', () => {
    const u = { name: 'นิ่ม ใจดี', nickname: 'นิ่ม', color: USER_COLORS[3] }
    const { container } = renderWithProviders(<UserAvatar user={u} />)
    const avatar = container.querySelector('[data-testid="user-avatar"]')
    expect(avatar).not.toBeNull()
    expect(avatar).toHaveTextContent(initialOf(u))
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
    expect(avatar).toHaveAttribute('data-color', USER_COLORS[3])
  })

  it('U-UN-03b the avatar falls back to the first palette colour and marks inactive users', () => {
    const { container } = renderWithProviders(
      <UserAvatar user={{ name: 'Mint', nickname: null, color: null, active: false }} />,
    )
    const avatar = container.querySelector('[data-testid="user-avatar"]')
    expect(avatar).toHaveAttribute('data-color', USER_COLORS[0])
    expect(avatar).toHaveAttribute('data-inactive', 'true')
  })

  it('U-UN-03c inactive avatars use one solid grey with ≥ 4.5:1 against white text (no opacity dimming)', () => {
    expect(contrastRatio(INACTIVE_AVATAR_BG, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    const { container } = renderWithProviders(
      <UserAvatar user={{ name: 'Mint', nickname: null, color: USER_COLORS[2], active: false }} />,
    )
    const avatar = container.querySelector<HTMLElement>('[data-testid="user-avatar"]')!
    const style = getComputedStyle(avatar)
    // Opacity would blend the grey with the page background (≈ 2.7:1 light, 3.6:1 dark at 0.7).
    expect(style.opacity === '' || style.opacity === '1').toBe(true)
    expect(style.backgroundColor).toBe('rgb(97, 97, 97)')
  })
})
