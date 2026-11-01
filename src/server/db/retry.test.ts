import { describe, expect, it, vi } from 'vitest'
import { withDeadlockRetry } from './retry'

describe('withDeadlockRetry (M6-D3)', () => {
  it('returns the first result without retrying', async () => {
    const fn = vi.fn(() => Promise.resolve(1))
    expect(await withDeadlockRetry(fn)).toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries once on 40P01 (wrapped in cause), then succeeds', async () => {
    const fn = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce({ cause: { code: '40P01' } })
      .mockResolvedValueOnce(2)
    expect(await withDeadlockRetry(fn)).toBe(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('a second deadlock and any other error propagate', async () => {
    const deadlock = Object.assign(new Error('deadlock'), { code: '40P01' })
    const twice = vi.fn(() => Promise.reject(deadlock))
    await expect(withDeadlockRetry(twice)).rejects.toBe(deadlock)
    expect(twice).toHaveBeenCalledTimes(2)
    const other = vi.fn(() => Promise.reject(new Error('x')))
    await expect(withDeadlockRetry(other)).rejects.toThrow('x')
    expect(other).toHaveBeenCalledTimes(1)
  })
})
