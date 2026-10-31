import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import type { PersonOption } from '@/lib/contracts/people'
import { renderWithProviders } from '../../../tests/helpers/render'
import { PersonPicker } from './PersonPicker'

const person = (
  id: string,
  name: string,
  nickname: string | null,
  positionName: string | null,
  active = true,
): PersonOption => ({
  id,
  name,
  nickname,
  positionName,
  color: null,
  active,
})

const ivy = person('ivy', 'Ivy Icarus', 'Ivy', 'QA')
const jack = person('jack', 'Jack Jo', 'Jack', 'Developer')
const nok = person('nok', 'Nok Deactivated', 'Nok', 'Developer', false)
const cindy = person('cindy', 'Cindy Chaiyaporn', 'Cindy', 'Project Manager')
const options = [cindy, ivy, jack, nok]

describe('PersonPicker', () => {
  it('hides inactive and excluded people', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <PersonPicker
        options={options}
        excludeIds={new Set(['cindy'])}
        onSelect={vi.fn()}
        label={th.members.pickerLabel}
      />,
    )
    const input = screen.getByRole('combobox', { name: th.members.pickerLabel })
    await user.type(input, 'Nok')
    expect(await screen.findByText(th.members.pickerEmpty)).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, 'Cindy')
    expect(await screen.findByText(th.members.pickerEmpty)).toBeInTheDocument()
    await user.clear(input)
    await user.type(input, 'o')
    const names = screen.getAllByRole('option').map((o) => o.textContent)
    expect(names.some((t) => t?.includes('Jack'))).toBe(true)
    expect(names.some((t) => t?.includes('Nok'))).toBe(false)
  })

  it('filters by name and calls onSelect with the person', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    renderWithProviders(<PersonPicker options={options} onSelect={onSelect} label={th.members.pickerLabel} />)
    await user.type(screen.getByRole('combobox', { name: th.members.pickerLabel }), 'ivy')
    const opts = screen.getAllByRole('option')
    expect(opts).toHaveLength(1)
    expect(opts[0]).toHaveTextContent('Ivy')
    expect(opts[0]).toHaveTextContent('QA')
    await user.click(opts[0]!)
    expect(onSelect).toHaveBeenCalledWith(ivy)
    // add mode (no `value`): the field is cleared for the next pick
    expect(screen.getByRole('combobox', { name: th.members.pickerLabel })).toHaveValue('')
  })

  it('searches by position', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PersonPicker options={options} onSelect={vi.fn()} label={th.members.pickerLabel} />)
    await user.type(screen.getByRole('combobox', { name: th.members.pickerLabel }), 'project man')
    const opts = screen.getAllByRole('option')
    expect(opts).toHaveLength(1)
    expect(opts[0]).toHaveTextContent('Cindy')
  })

  it('controlled mode shows the selected person and can be cleared', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    renderWithProviders(
      <PersonPicker
        options={options}
        value={jack}
        onSelect={vi.fn()}
        onClear={onClear}
        label={th.projects.fields.lead}
      />,
    )
    const input = screen.getByRole('combobox', { name: th.projects.fields.lead })
    expect(input).toHaveValue('Jack')
    await user.clear(input)
    expect(onClear).toHaveBeenCalled()
  })

  it('while loading shows the loading text, not "nobody matches"', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PersonPicker options={[]} loading onSelect={vi.fn()} label={th.members.pickerLabel} />)
    await user.click(screen.getByRole('combobox', { name: th.members.pickerLabel }))
    expect(await screen.findByText(th.common.loading)).toBeInTheDocument()
    expect(screen.queryByText(th.members.pickerEmpty)).not.toBeInTheDocument()
  })

  it('a failed load shows the error with a retry button (P4), never "nobody matches"', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderWithProviders(
      <PersonPicker
        options={[]}
        loadError
        onRetry={onRetry}
        onSelect={vi.fn()}
        label={th.members.pickerLabel}
        helperText="hint"
      />,
    )
    expect(screen.getByText(th.members.pickerLoadError)).toBeInTheDocument()
    expect(screen.queryByText('hint')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: th.common.retry }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('combobox', { name: th.members.pickerLabel }))
    expect(screen.queryByText(th.members.pickerEmpty)).not.toBeInTheDocument()
  })
})
