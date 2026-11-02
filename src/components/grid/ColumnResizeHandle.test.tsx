// ColumnResizeHandle (S3.2; FR-814, AC-808, M7.1-D9): a vertical separator; ←/→ ±16, Shift ±64, Home/End, Enter = 240
// change aria-valuenow; the preference is saved once per gesture (keys: 500 ms after the last one; pointer: on release);
// double-click resets to 240; widths stay within 160–640 and 60 % of the grid.
import { act, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { TASK_W_DEFAULT, TASK_W_MAX, TASK_W_MIN } from '@/lib/grid/frozen'
import { ColumnResizeHandle } from './ColumnResizeHandle'
import { createGridStore } from './gridStore'
import { renderGrid } from './render.test.helper'
import { RESIZE_SAVE_DELAY_MS } from './useColumnResize'

function Harness(p: { initial: number; gridWidth: number; onSave: (w: number) => void; onLive: (w: number) => void }) {
  const [w, setW] = useState(p.initial)
  const [store] = useState(createGridStore)
  return (
    <ColumnResizeHandle
      width={w}
      gridWidth={p.gridWidth}
      showAssignees
      onLive={p.onLive}
      onCommit={setW}
      onSave={p.onSave}
      store={store}
    />
  )
}

function setup(initial = TASK_W_DEFAULT, gridWidth = 1600) {
  const onSave = vi.fn()
  const onLive = vi.fn()
  renderGrid(<Harness initial={initial} gridWidth={gridWidth} onSave={onSave} onLive={onLive} />)
  const sep = screen.getByRole('separator', { name: th.grid.columns.resize })
  return { sep, onSave, onLive }
}

afterEach(() => vi.useRealTimers())

describe('ColumnResizeHandle (FR-814)', () => {
  it('is a vertical separator with min / max / now', () => {
    const { sep } = setup()
    expect(sep).toHaveAttribute('aria-orientation', 'vertical')
    expect(sep).toHaveAttribute('aria-valuemin', String(TASK_W_MIN))
    expect(sep).toHaveAttribute('aria-valuemax', String(TASK_W_MAX))
    expect(sep).toHaveAttribute('aria-valuenow', String(TASK_W_DEFAULT))
    expect(sep).toHaveAccessibleDescription(th.grid.columns.resizeHint)
  })

  it('→ ×5 = +80 (AC-808), Shift+← = −64, Home / End, Enter = 240; one save 500 ms after the last key', () => {
    vi.useFakeTimers()
    const { sep, onSave } = setup()
    for (let i = 0; i < 5; i++) fireEvent.keyDown(sep, { key: 'ArrowRight' })
    expect(sep).toHaveAttribute('aria-valuenow', String(TASK_W_DEFAULT + 80))
    fireEvent.keyDown(sep, { key: 'ArrowLeft', shiftKey: true })
    expect(sep).toHaveAttribute('aria-valuenow', String(TASK_W_DEFAULT + 16))
    expect(onSave).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(RESIZE_SAVE_DELAY_MS)
    })
    expect(onSave).toHaveBeenCalledExactlyOnceWith(TASK_W_DEFAULT + 16)
    fireEvent.keyDown(sep, { key: 'End' })
    expect(sep).toHaveAttribute('aria-valuenow', String(TASK_W_MAX))
    fireEvent.keyDown(sep, { key: 'Home' })
    expect(sep).toHaveAttribute('aria-valuenow', String(TASK_W_MIN))
    fireEvent.keyDown(sep, { key: 'Enter' })
    expect(sep).toHaveAttribute('aria-valuenow', String(TASK_W_DEFAULT))
    act(() => {
      vi.advanceTimersByTime(RESIZE_SAVE_DELAY_MS)
    })
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave).toHaveBeenLastCalledWith(TASK_W_DEFAULT)
  })

  it('keys clamp to 60 % of a narrow grid (minus the assignee column)', () => {
    const { sep } = setup(TASK_W_DEFAULT, 600)
    fireEvent.keyDown(sep, { key: 'End' })
    expect(sep).toHaveAttribute('aria-valuenow', String(Math.floor((600 * 3) / 5) - 112))
  })

  it('pointer drag: live widths while moving, one commit + save on release', () => {
    const { sep, onSave, onLive } = setup()
    fireEvent.pointerDown(sep, { button: 0, pointerId: 1, clientX: 500 })
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 600 })
    fireEvent.pointerMove(sep, { pointerId: 1, clientX: 680 })
    expect(onLive).toHaveBeenLastCalledWith(TASK_W_DEFAULT + 180)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.pointerUp(sep, { pointerId: 1, clientX: 680 })
    expect(onSave).toHaveBeenCalledExactlyOnceWith(TASK_W_DEFAULT + 180)
    expect(sep).toHaveAttribute('aria-valuenow', String(TASK_W_DEFAULT + 180))
  })

  it('pointercancel restores the start width without saving; double-click resets to 240 and saves', () => {
    const { sep, onSave, onLive } = setup(400)
    fireEvent.pointerDown(sep, { button: 0, pointerId: 2, clientX: 500 })
    fireEvent.pointerMove(sep, { pointerId: 2, clientX: 560 })
    fireEvent.pointerCancel(sep, { pointerId: 2 })
    expect(onLive).toHaveBeenLastCalledWith(400)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.doubleClick(sep)
    expect(onSave).toHaveBeenCalledExactlyOnceWith(TASK_W_DEFAULT)
    expect(sep).toHaveAttribute('aria-valuenow', String(TASK_W_DEFAULT))
  })
})
