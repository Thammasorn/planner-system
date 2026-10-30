import { render, screen } from '@testing-library/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

function List({ initialRect }: { initialRect?: { width: number; height: number } }) {
  const ref = useRef<HTMLDivElement>(null)
  const v = useVirtualizer({ count: 1000, getScrollElement: () => ref.current, estimateSize: () => 20, initialRect, overscan: 0 })
  return (
    <div ref={ref} style={{ height: 200, overflow: 'auto' }}>
      {v.getVirtualItems().map((i) => (
        <div key={i.key} role="listitem">{i.index}</div>
      ))}
    </div>
  )
}

describe('TanStack Virtual in a DOM without layout', () => {
  it('renders no rows without initialRect (element size is 0)', () => {
    render(<List />)
    console.log('[virtual] rows without initialRect =', screen.queryAllByRole('listitem').length)
  })
  it('initialRect alone is overwritten by the 0x0 mount measurement', () => {
    render(<List initialRect={{ width: 300, height: 200 }} />)
    console.log('[virtual] rows with initialRect only =', screen.queryAllByRole('listitem').length)
  })
  it('stubbing offsetWidth/offsetHeight gives the virtualizer a viewport', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300)
    render(<List />)
    const n = screen.queryAllByRole('listitem').length
    console.log('[virtual] rows with stubbed offsetWidth/offsetHeight =', n)
    expect(n).toBe(10)
  })
})
