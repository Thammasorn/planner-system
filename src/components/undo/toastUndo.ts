'use client'
import { toast } from 'sonner'
import { th } from '@/i18n/th'

/** SPEC §7.5: the undo toast stays 8 s. */
export const UNDO_TOAST_MS = 8000

/** Shows "<message> [เลิกทำ]" for 8 s; returns the sonner id so the caller can dismiss it. */
export function toastUndo(message: string, onUndo: () => Promise<void> | void): string | number {
  return toast(message, {
    duration: UNDO_TOAST_MS,
    action: { label: th.undo.undo, onClick: () => void onUndo() },
  })
}
