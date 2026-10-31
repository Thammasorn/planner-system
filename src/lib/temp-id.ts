// src/lib/temp-id.ts — client-side temporary ids for optimistic rows (X53). Never crypto.randomUUID (missing over
// plain HTTP on a LAN); getRandomValues exists in every secure and insecure context. Resolved to server ids through
// the mutation's idMap before reaching any action (R9).
let counter = 0

/** 'tmp_<counter>_<12 hex chars>'. */
export function tempId(): string {
  counter += 1
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `tmp_${counter}_${hex}`
}

export const isTempId = (id: string): boolean => id.startsWith('tmp_')
