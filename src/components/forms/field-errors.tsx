'use client'
import type { ReactNode } from 'react'
import { z } from '@/lib/z'

export type FieldErrors = Partial<Record<string, string[]>>

/** Zod issues → `{ field: messages[] }` (the same shape server actions return as `fieldErrors`). */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors
}

/** Merges error maps, keeping each message once per field. */
export function mergeFieldErrors(...maps: (FieldErrors | undefined)[]): FieldErrors {
  const out: Record<string, string[]> = {}
  for (const m of maps) {
    if (!m) continue
    for (const [k, msgs] of Object.entries(m)) {
      if (!msgs?.length) continue
      out[k] = [...new Set([...(out[k] ?? []), ...msgs])]
    }
  }
  return out
}

/**
 * MUI `helperText` content: every message on its own line (so each one is findable on its own), else the hint.
 */
export function helperText(messages: string[] | undefined, hint?: string): ReactNode {
  if (!messages?.length) return hint
  return messages.map((m) => (
    <span key={m} style={{ display: 'block' }}>
      {m}
    </span>
  ))
}
