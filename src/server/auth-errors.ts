// src/server/auth-errors.ts — Better Auth APIError → our error codes, one place (M1-D12, X-26).
// No 'server-only' (M1-D4).
import { isAPIError } from 'better-auth/api'
import { th } from '@/i18n/th'
import { AppError, RateLimitedError } from './errors'

/**
 * INVALID_EMAIL_OR_PASSWORD | INVALID_EMAIL → INVALID_CREDENTIALS (401) · BANNED_USER → ACCOUNT_DEACTIVATED (403) ·
 * LOGIN_LOCKED or HTTP 429 → LOGIN_LOCKED (429). Anything else is rethrown as is (the wrapper → INTERNAL).
 * Usage: `catch (e) { throw mapAuthApiError(e) }`.
 */
export function mapAuthApiError(e: unknown): AppError {
  if (!isAPIError(e)) throw e
  const code = (e.body as { code?: unknown } | undefined)?.code
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || code === 'INVALID_EMAIL') {
    return new AppError('INVALID_CREDENTIALS', th.auth.errors.INVALID_CREDENTIALS)
  }
  if (code === 'BANNED_USER') return new AppError('ACCOUNT_DEACTIVATED', th.auth.errors.ACCOUNT_DEACTIVATED)
  if (code === 'LOGIN_LOCKED' || e.statusCode === 429) return new RateLimitedError()
  throw e
}
