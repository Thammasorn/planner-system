import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { th } from '@/i18n/th'
import { invalidateLoad } from '@/lib/invalidate'
import { renderUi } from './render.test.helper'
import { WorkloadBadge } from './WorkloadBadge'

const m = vi.hoisted(() => ({ getJson: vi.fn() }))
vi.mock('@/lib/api', () => ({ getJson: m.getJson }))

const badge = (n: number) => ({ overCount: n, from: '2026-09-28', to: '2026-10-26' })

describe('WorkloadBadge (FR-1007, X31, M9-D11)', () => {
  it('initial 2 renders "2" with the label; a refetch after invalidateLoad shows 3', async () => {
    // the mount refetch (initialDataUpdatedAt 0) answers 2, the one after invalidateLoad answers 3
    m.getJson.mockResolvedValueOnce(badge(2)).mockResolvedValueOnce(badge(3))
    const { qc } = renderUi(<WorkloadBadge initial={2} />)
    const el = screen.getByRole('img', { name: th.workload.badge.label(2) })
    expect(el).toHaveTextContent('2')
    await waitFor(() => expect(m.getJson).toHaveBeenCalledTimes(1))
    await act(() => invalidateLoad(qc))
    expect(await screen.findByRole('img', { name: th.workload.badge.label(3) })).toHaveTextContent('3')
    expect(m.getJson).toHaveBeenCalledWith('/api/workload/badge', expect.anything())
  })

  it('0 renders nothing', () => {
    m.getJson.mockResolvedValue(badge(0))
    renderUi(<WorkloadBadge initial={0} />)
    expect(screen.queryByTestId('workload-badge')).toBeNull()
  })
})
