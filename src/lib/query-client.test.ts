import { describe, expect, it } from 'vitest'
import { getQueryClient } from './query-client'

describe('getQueryClient (server)', () => {
  it('returns a new client per call on the server', () => {
    expect(getQueryClient()).not.toBe(getQueryClient())
  })

  it('uses the PLAN.md §3.5 query defaults', () => {
    const q = getQueryClient().getDefaultOptions().queries
    expect(q?.staleTime).toBe(60_000)
    expect(q?.retry).toBe(1)
    expect(q?.refetchOnWindowFocus).toBe(true)
  })
})
