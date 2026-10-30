import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { renderWithProviders } from '../../tests/helpers/render'
import ErrorPage from './error'

describe('error.tsx', () => {
  it('renders the Thai error page and retries on click', async () => {
    const retry = vi.fn()
    const error = Object.assign(new Error('boom'), { digest: 'abc' })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderWithProviders(<ErrorPage error={error} retry={retry} />)

    expect(screen.getByRole('heading', { level: 1, name: th.errors.errorPage.title })).toBeInTheDocument()
    expect(screen.getByText(th.errors.errorPage.body)).toBeInTheDocument()
    expect(screen.queryByText('boom')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: th.common.retry }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
