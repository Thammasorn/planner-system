/** Random initial passwords (FR-202, X60, X53). Isomorphic: uses crypto.getRandomValues, never randomUUID. */

/** 57 characters (24 upper, 25 lower, 8 digits) without the look-alikes 0 O 1 l I. */
export const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

const N = PASSWORD_ALPHABET.length
/** Largest multiple of N ≤ 2^32: values at or above it are rejected so every character is equally likely. */
const LIMIT = Math.floor(2 ** 32 / N) * N
/** A healthy rng satisfies the classes within a few rounds; this only stops a broken rng from looping forever. */
const MAX_ROUNDS = 1000

export type RandomFill = (buf: Uint32Array) => void

const defaultRng: RandomFill = (b) => {
  crypto.getRandomValues(b)
}

function hasEveryClass(s: string): boolean {
  return /[A-Z]/.test(s) && /[a-z]/.test(s) && /[2-9]/.test(s)
}

/**
 * `length` characters from PASSWORD_ALPHABET by rejection sampling, retried until the result has at least one
 * upper-case letter, one lower-case letter and one digit.
 */
export function randomPassword(length = 12, rng: RandomFill = defaultRng): string {
  if (!Number.isInteger(length) || length < 3 || length > 128) {
    throw new RangeError(`Password length must be an integer in 3…128, got ${length}`)
  }
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let out = ''
    while (out.length < length) {
      const buf = new Uint32Array(length * 2)
      rng(buf)
      for (const v of buf) {
        if (v >= LIMIT) continue
        out += PASSWORD_ALPHABET[v % N]
        if (out.length === length) break
      }
    }
    if (hasEveryClass(out)) return out
  }
  throw new Error('randomPassword: random source never produced every character class')
}
