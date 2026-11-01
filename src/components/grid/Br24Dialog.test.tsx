// plan/m07 S3.8 — the BR-24 choice dialog (M7-D3/D4).
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DayCtx } from '@/domain/allocation'
import { th } from '@/i18n/th'
import type { ConflictPair } from '@/lib/grid/br24'
import { Br24Dialog } from './Br24Dialog'

const ctx = (week: string): DayCtx => ({
  week,
  dayCaps: [100, 100, 100, 100, 100, 0, 0],
  schedule: [100, 100, 100, 100, 100, 0, 0],
  timeOff: [false, false, false, false, false, false, false],
})
const pair = (o: Partial<ConflictPair> = {}): ConflictPair => ({
  taskAssignmentId: 'a-ivy',
  week: '2026-09-28',
  fromCd: 300,
  toCd: 200,
  days: [50, 50, 100, 50, 50, 0, 0],
  userId: 'ivy',
  ...o,
})

function renderDialog(pairs: ConflictPair[]) {
  const onChoose = vi.fn()
  const onCancel = vi.fn()
  render(
    <Br24Dialog open pairs={pairs} nameOf={() => 'Ivy'} ctxOf={(p) => ctx(p.week)} onChoose={onChoose} onCancel={onCancel} />,
  )
  return { onChoose, onCancel }
}

describe('Br24Dialog', () => {
  it('one pair: title, breakdown, change, previews; SCALE → onChoose', () => {
    const { onChoose } = renderDialog([pair()])
    const d = screen.getByRole('dialog')
    expect(within(d).getByText(th.grid.br24.title(1))).toBeInTheDocument()
    expect(within(d).getByText(th.grid.br24.breakdown('จ 0.5 · อ 0.5 · พ 1.0 · พฤ 0.5 · ศ 0.5'))).toBeInTheDocument()
    expect(within(d).getByText(th.grid.br24.change('3.0', '2.0'))).toBeInTheDocument()
    expect(within(d).getByText(th.grid.br24.scalePreview('จ 0.3 · อ 0.3 · พ 0.7 · พฤ 0.3 · ศ 0.3'))).toBeInTheDocument()
    expect(within(d).getByText(th.grid.br24.collapsePreview('2.0'))).toBeInTheDocument()
    fireEvent.click(within(d).getByTestId('br24-scale'))
    expect(onChoose).toHaveBeenCalledWith('SCALE')
  })
  it('COLLAPSE → onChoose; Escape → onCancel', () => {
    const { onChoose, onCancel } = renderDialog([pair()])
    fireEvent.click(screen.getByTestId('br24-collapse'))
    expect(onChoose).toHaveBeenCalledWith('COLLAPSE')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })
  it('three pairs → title(3) and three pair lines', () => {
    renderDialog([pair(), pair({ week: '2026-10-05' }), pair({ week: '2026-10-12', taskAssignmentId: 'b' })])
    const d = screen.getByRole('dialog')
    expect(within(d).getByText(th.grid.br24.title(3))).toBeInTheDocument()
    expect(within(d).getAllByRole('listitem')).toHaveLength(3)
  })
})
