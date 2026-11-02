import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { PlanViewSwitch } from './PlanViewSwitch'

describe('PlanViewSwitch (FR-810)', () => {
  it('a labelled segmented control; pressing the other view calls onChange once, the current one never', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PlanViewSwitch view="GRID" onChange={onChange} />)
    expect(screen.getByRole('group', { name: th.planView.label })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: th.planView.grid })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: th.planView.grid }))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: th.planView.calendar }))
    expect(onChange).toHaveBeenCalledWith('CALENDAR')
  })

  it('keyboard: Tab into the group, → to the calendar button (roving focus), Enter switches', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PlanViewSwitch view="GRID" onChange={onChange} />)
    await user.tab()
    expect(screen.getByRole('button', { name: th.planView.grid })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: th.planView.calendar })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('CALENDAR')
  })
})
