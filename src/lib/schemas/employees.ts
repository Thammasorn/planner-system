// src/lib/schemas/employees.ts — employee create/update/deactivate/reset schemas (FR-201…FR-207, X60).
import { th } from '@/i18n/th'
import { USER_COLORS } from '@/lib/user-colors'
import { z } from '@/lib/z'
import { emailField, PASSWORD_MAX, refinePassword } from './account'

export const FRACTION_CD = [25, 50, 75, 100] as const

export const scheduleInput = z
  .array(
    z.object({
      weekday: z.int().min(1).max(7),
      fractionCd: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]),
    }),
  )
  .min(1, { error: th.employees.schedule.atLeastOneDay })
  .max(7)
  .refine((d) => new Set(d.map((x) => x.weekday)).size === d.length, { error: th.errors.VALIDATION })

/** FR-207 default: Mon–Fri, full days. */
export const DEFAULT_SCHEDULE = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, fractionCd: 100 as const }))

const profile = {
  name: z.string().trim().min(1, { error: th.employees.nameRequired }).max(200),
  nickname: z.string().trim().max(50).optional(), // '' → null in the service
  email: emailField,
  positionId: z.uuid().nullable(),
  role: z.enum(['manager', 'worker']),
  color: z.enum(USER_COLORS).nullable().optional(), // null/undefined → least-used colour (create) / unchanged (update)
}

export const createEmployeeInput = refinePassword(
  z.object({
    ...profile,
    password: z.string().max(PASSWORD_MAX),
    mustChangePassword: z.boolean().default(true), // FR-203
    schedule: scheduleInput.default(DEFAULT_SCHEDULE),
  }),
  (v) => ({ password: v.password, email: v.email }),
  'password',
)
export const updateEmployeeInput = z.object({ userId: z.uuid(), ...profile, schedule: scheduleInput })

export type CreateEmployeeInput = z.input<typeof createEmployeeInput>
export type UpdateEmployeeInput = z.input<typeof updateEmployeeInput>
export type CreateEmployeeData = z.output<typeof createEmployeeInput>
export type UpdateEmployeeData = z.output<typeof updateEmployeeInput>

export const userIdInput = z.object({ userId: z.uuid() })
/** Policy vs the target's email is checked in the action (the target is loaded there). */
export const resetPasswordInput = z.object({ userId: z.uuid(), password: z.string().max(PASSWORD_MAX) })
