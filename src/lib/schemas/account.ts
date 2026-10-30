// src/lib/schemas/account.ts — login + own-password schemas and the password policy (FR-101, FR-105, X60).
// Isomorphic: used by client forms (safeParse) and by the server actions (same schema).
import { th } from '@/i18n/th'
import { z } from '@/lib/z'

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

export type PasswordIssue = 'TOO_SHORT' | 'TOO_LONG' | 'EQUALS_EMAIL' | 'SAME_AS_CURRENT'
const ISSUE_ORDER: readonly PasswordIssue[] = ['TOO_SHORT', 'TOO_LONG', 'EQUALS_EMAIL', 'SAME_AS_CURRENT']

const norm = (s: string) => s.trim().toLowerCase()

/**
 * X60: length 8–128 (code points); trimmed+lowercased password ≠ email and ≠ its local part (skipped when email
 * is ''); ≠ currentPassword when given (self-change only). Returns issues in this order, deduplicated.
 */
export function passwordPolicy(
  password: string,
  ctx: { email: string; currentPassword?: string },
): PasswordIssue[] {
  const issues = new Set<PasswordIssue>()
  const length = [...password].length
  if (length < PASSWORD_MIN) issues.add('TOO_SHORT')
  if (length > PASSWORD_MAX) issues.add('TOO_LONG')
  const email = norm(ctx.email)
  if (email !== '') {
    const p = norm(password)
    const at = email.indexOf('@')
    const local = at > 0 ? email.slice(0, at) : email
    if (p === email || p === local) issues.add('EQUALS_EMAIL')
  }
  if (ctx.currentPassword !== undefined && password === ctx.currentPassword) issues.add('SAME_AS_CURRENT')
  return ISSUE_ORDER.filter((i) => issues.has(i))
}

/** Adds one `.refine(fn, { error, path })` per PasswordIssue — the verified Zod 4 API (r4 §29). */
export function refinePassword<T extends z.ZodType>(
  schema: T,
  pick: (v: z.output<T>) => { password: string; email: string; currentPassword?: string },
  path: string,
): T {
  let out = schema
  for (const issue of ISSUE_ORDER) {
    out = out.refine(
      (v) => {
        const { password, ...ctx } = pick(v)
        return !passwordPolicy(password, ctx).includes(issue)
      },
      { error: th.account.policy[issue], path: [path] },
    )
  }
  return out
}

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: th.employees.emailInvalid }))

export const loginInput = z.object({
  email: emailField,
  password: z.string().min(1, { error: th.auth.passwordRequired }).max(PASSWORD_MAX),
  next: z.string().max(2000).optional(),
})
export type LoginInput = z.input<typeof loginInput>

export const changePasswordInput = refinePassword(
  z
    .object({
      currentPassword: z.string().min(1, { error: th.account.policy.REQUIRED }).max(PASSWORD_MAX),
      newPassword: z.string().max(PASSWORD_MAX),
      confirmPassword: z.string().max(PASSWORD_MAX),
      next: z.string().max(2000).optional(),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      error: th.account.policy.MISMATCH,
      path: ['confirmPassword'],
    }),
  // EQUALS_EMAIL for self-change is checked in the action with user.email (the form also calls passwordPolicy).
  (v) => ({ password: v.newPassword, email: '', currentPassword: v.currentPassword }),
  'newPassword',
)
export type ChangePasswordInput = z.input<typeof changePasswordInput>
