import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { qk, type GridChunk } from '@/lib/query-keys'
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

  it('M8 (S3.8, M8-D26): a project save invalidates its milestones (overview late / lateTaskCount)', () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.projectMilestones('p'), {})
    qc.setQueryData(qk.projectMilestones('other'), {})
    qc.setQueryData(qk.projectTasks('p'), {})
    qc.setQueryData(qk.calendar('2026-09-28', '2026-11-02'), {})
    invalidateAfterGridSave(qc, { kind: 'project', id: 'p' })
    expect(qc.getQueryState(qk.projectMilestones('p'))?.isInvalidated).toBe(true)
    expect(qc.getQueryState(qk.projectTasks('p'))?.isInvalidated).toBe(true)
    expect(qc.getQueryState(qk.calendar('2026-09-28', '2026-11-02'))?.isInvalidated).toBe(true)
    expect(qc.getQueryState(qk.projectMilestones('other'))?.isInvalidated).toBe(false)
  })

  it('a person save does not touch projectMilestones', () => {
    const qc = new QueryClient()
    qc.setQueryData(qk.projectMilestones('u'), {})
    invalidateAfterGridSave(qc, { kind: 'person', id: 'u' })
    expect(qc.getQueryState(qk.projectMilestones('u'))?.isInvalidated).toBe(false)
  })

  describe('M9 (S3.7, M9-D22): the OTHER grid context + the sidebar', () => {
    const chunk: GridChunk = { from: '2026-09-28', expand: [], zoom: 'WEEK', includeOthers: false }
    it('a person save invalidates project grids, the badge and the sidebar — never its own chunks', () => {
      const qc = new QueryClient()
      const project = qk.gridChunk({ kind: 'project', id: 'p' }, chunk)
      const own = qk.gridChunk({ kind: 'person', id: 'u' }, chunk)
      const otherPerson = qk.gridChunk({ kind: 'person', id: 'v' }, chunk)
      for (const k of [project, own, otherPerson, qk.workloadBadge(), qk.sidebar()]) qc.setQueryData(k, {})
      invalidateAfterGridSave(qc, { kind: 'person', id: 'u' })
      expect(qc.getQueryState(project)?.isInvalidated).toBe(true)
      expect(qc.getQueryState(qk.workloadBadge())?.isInvalidated).toBe(true)
      expect(qc.getQueryState(qk.sidebar())?.isInvalidated).toBe(true)
      expect(qc.getQueryState(own)?.isInvalidated).toBe(false)
      expect(qc.getQueryState(otherPerson)?.isInvalidated).toBe(false)
    })

    it('a project save invalidates person grids and keeps M8\'s projectMilestones — never its own chunks', () => {
      const qc = new QueryClient()
      const person = qk.gridChunk({ kind: 'person', id: 'u' }, chunk)
      const own = qk.gridChunk({ kind: 'project', id: 'p' }, chunk)
      for (const k of [person, own, qk.projectMilestones('p'), qk.sidebar()]) qc.setQueryData(k, {})
      invalidateAfterGridSave(qc, { kind: 'project', id: 'p' })
      expect(qc.getQueryState(person)?.isInvalidated).toBe(true)
      expect(qc.getQueryState(qk.projectMilestones('p'))?.isInvalidated).toBe(true)
      expect(qc.getQueryState(qk.sidebar())?.isInvalidated).toBe(true)
      expect(qc.getQueryState(own)?.isInvalidated).toBe(false)
    })
  })
})
