// src/components/projects/errors.ts — the Thai message of a failed action / route call (ActionFailure, ApiError).
import { th } from '@/i18n/th'

export function errorMessage(err: unknown): string {
  return err instanceof Error && err.message !== '' ? err.message : th.errors.INTERNAL
}
