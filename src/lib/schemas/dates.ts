// src/lib/schemas/dates.ts — shared plan-date field schemas (plan/m05 S0.6). Messages come from th (callers pass them).
import { z } from '@/lib/z'

/** A real calendar date 'YYYY-MM-DD' (Zod 4 `z.iso.date`, X47) with a caller-supplied Thai message. */
export const isoDateSchema = (error: string) => z.iso.date({ error })
