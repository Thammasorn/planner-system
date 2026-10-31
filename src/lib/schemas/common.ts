// src/lib/schemas/common.ts — shared field schemas (M2 S0.9). Messages come from th (forms show them as-is).
import { th } from '@/i18n/th'
import { z } from '@/lib/z'

/** Better Auth user ids are text, not uuids (M2-D14). */
export const userIdSchema = z.string().min(1).max(64)

/** '#RRGGBB', stored upper case (M2-D15). */
export const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, { error: th.projects.errors.invalidColor })
  .transform((v) => v.toUpperCase())

/** Trimmed optional text; '' → null; undefined = unchanged, null = clear. */
export const optionalText = (max: number, error: string) =>
  z
    .string()
    .trim()
    .max(max, { error })
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
