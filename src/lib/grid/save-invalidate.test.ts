import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { qk } from '@/lib/query-keys'
import { invalidateAfterGridSave } from './save-invalidate'

describe('invalidateAfterGridSave (X82)', () => {
  it('invalidates other load views but never the saving grid', () => {
    const qc = new QueryClient()
    const ctx = { kind: 'project', id: 'p' } as const
    const chunkKey = qk.gridChunk(ctx, { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: false })
    qc.setQueryData(qk.myTasks(), [])
    qc.setQueryData(chunkKey, {})
    qc.setQueryData(['workload', 'table', {}], {})
    invalidateAfterGridSave(qc, ctx)
    expect(qc.getQueryState(qk.myTasks())?.isInvalidated).toBe(true)
    expect(qc.getQueryState(['workload', 'table', {}])?.isInvalidated).toBe(true)
    expect(qc.getQueryState(chunkKey)?.isInvalidated).toBe(false)
  })
})
