import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { QuickAdd } from './QuickAdd'

function setup() {
  const onCreate = vi.fn()
  const onEscape = vi.fn()
  const ref = createRef<HTMLInputElement>()
  render(<QuickAdd depth={0} disabled={false} inputRef={ref} onCreate={onCreate} onEscape={onEscape} />)
  const input = screen.getByRole('textbox', { name: th.tasks.quickAdd.label })
  return { onCreate, onEscape, input, ref }
}

describe('QuickAdd (FR-602, AC-601)', () => {
  it('creates one task per Enter and keeps the cursor for the next one', async () => {
    const user = userEvent.setup()
    const { onCreate, input } = setup()
    await user.click(input)
    await user.keyboard('A{Enter}B{Enter}C{Enter}')
    expect(onCreate.mock.calls).toEqual([['A'], ['B'], ['C']])
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('ignores an empty or blank name', async () => {
    const user = userEvent.setup()
    const { onCreate, input } = setup()
    await user.click(input)
    await user.keyboard('   {Enter}')
    await user.keyboard('{Enter}')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('trims the name', async () => {
    const user = userEvent.setup()
    const { onCreate, input } = setup()
    await user.click(input)
    await user.keyboard('  งาน  {Enter}')
    expect(onCreate).toHaveBeenCalledWith('งาน')
  })

  it('Escape calls onEscape', async () => {
    const user = userEvent.setup()
    const { onEscape, input, ref } = setup()
    await user.click(input)
    await user.keyboard('{Escape}')
    expect(onEscape).toHaveBeenCalled()
    expect(ref.current).toBe(input)
  })
})
