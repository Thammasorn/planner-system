// src/lib/api.ts — the one JSON fetch helper for TanStack queryFns (X83: `getJson`, never `getJSON`).
// Route handlers answer errors as `{ code, message, fieldErrors? }` with the code's HTTP status (src/server/route.ts).
import { th } from '@/i18n/th'
import { ERROR_STATUS, type ErrorCode } from './action-result'

/** A non-2xx route response; `message` is the server's Thai message (th.errors.INTERNAL when the body is unusable). */
export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly fieldErrors?: Record<string, string[]>

  constructor(status: number, code: ErrorCode, message: string, fieldErrors?: Record<string, string[]>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    if (fieldErrors) this.fieldErrors = fieldErrors
  }
}

function isErrorCode(v: unknown): v is ErrorCode {
  return typeof v === 'string' && Object.hasOwn(ERROR_STATUS, v)
}

async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null)
  const b = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const code = isErrorCode(b.code) ? b.code : 'INTERNAL'
  const message = typeof b.message === 'string' && b.message !== '' ? b.message : th.errors[code]
  const fieldErrors =
    b.fieldErrors !== null && typeof b.fieldErrors === 'object'
      ? (b.fieldErrors as Record<string, string[]>)
      : undefined
  return new ApiError(res.status, code, message, fieldErrors)
}

/** GET (by default) a JSON route; non-2xx → throws ApiError. Pass `{ signal }` from the queryFn context. */
export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('accept', 'application/json')
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) throw await toApiError(res)
  return (await res.json()) as T
}
