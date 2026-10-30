import { describe, expect, it, vi } from 'vitest'
import { PASSWORD_ALPHABET, randomPassword } from './random-password'

const N = PASSWORD_ALPHABET.length
const LIMIT = Math.floor(2 ** 32 / N) * N

/** rng that writes the given values in order (cycling through `rest` once `first` is used up). */
function scriptedRng(first: number[], rest: number[]): (buf: Uint32Array) => void {
  const queue = [...first]
  let i = 0
  return (buf) => {
    for (let k = 0; k < buf.length; k++) {
      const next = queue.shift()
      buf[k] = next ?? rest[i++ % rest.length]!
    }
  }
}

const idx = (ch: string) => PASSWORD_ALPHABET.indexOf(ch)

describe('randomPassword (FR-202, X60)', () => {
  it('alphabet is 57 unambiguous characters (24 upper + 25 lower + 8 digits)', () => {
    expect(N).toBe(57)
    expect(new Set(PASSWORD_ALPHABET).size).toBe(N)
  })

  it('U-PW-01 length 12 by default', () => {
    expect(randomPassword()).toHaveLength(12)
    expect(randomPassword(20)).toHaveLength(20)
  })

  it('U-PW-02 1 000 samples: every char ∈ alphabet, each has upper/lower/digit', () => {
    for (let i = 0; i < 1000; i++) {
      const pw = randomPassword()
      expect(pw).toHaveLength(12)
      for (const ch of pw) expect(PASSWORD_ALPHABET).toContain(ch)
      expect(pw).toMatch(/[A-Z]/)
      expect(pw).toMatch(/[a-z]/)
      expect(pw).toMatch(/[2-9]/)
    }
  })

  it('U-PW-03 never contains 0 O 1 l I', () => {
    for (const ch of '0O1lI') expect(PASSWORD_ALPHABET).not.toContain(ch)
    for (let i = 0; i < 200; i++) expect(randomPassword()).not.toMatch(/[0O1lI]/)
  })

  it('U-PW-04 a draw without every class is retried and the result satisfies the classes', () => {
    const lowerOnly = Array.from({ length: 24 }, () => idx('a'))
    const good = [idx('A'), idx('b'), idx('3')]
    const rng = vi.fn(scriptedRng(lowerOnly, good))
    const pw = randomPassword(12, rng)
    expect(rng.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(pw).toBe('Ab3Ab3Ab3Ab3')
  })

  it('U-PW-05 values ≥ the rejection limit are skipped', () => {
    const rng = scriptedRng([0xffffffff, LIMIT, LIMIT - 1], [idx('A'), idx('b'), idx('3')])
    const pw = randomPassword(4, rng)
    // LIMIT - 1 ≡ N - 1 (mod N) is accepted → the last alphabet character, then the cycle.
    expect(pw).toBe(`${PASSWORD_ALPHABET[(LIMIT - 1) % N]}Ab3`)
  })

  it('refills when one buffer has too few accepted values', () => {
    const rejects = Array.from({ length: 30 }, () => 0xffffffff)
    const pw = randomPassword(3, scriptedRng(rejects, [idx('A'), idx('b'), idx('3')]))
    expect(pw).toBe('Ab3')
  })

  it('uses crypto.getRandomValues by default, never crypto.randomUUID (X53)', () => {
    const grv = vi.spyOn(crypto, 'getRandomValues')
    const uuid = vi.spyOn(crypto, 'randomUUID')
    randomPassword()
    expect(grv).toHaveBeenCalled()
    expect(uuid).not.toHaveBeenCalled()
  })

  it.each([0, 2, 1.5, 129])('rejects length %d', (len) => {
    expect(() => randomPassword(len)).toThrow(RangeError)
  })

  it('gives up with an error when the rng never produces every class', () => {
    expect(() => randomPassword(12, (b) => b.fill(0))).toThrow(Error)
  })
})
