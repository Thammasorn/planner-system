// tests/authz/_support/http.ts — calling App Router route handlers directly (session from asUser/asNobody).
import type { RouteHandler } from '@/server/route'

type Params = Record<string, string | string[]>

/** `GET(new Request('http://t/api/…'), { params })` — the shape Next passes to a route handler. */
export function callRoute<P extends Params>(
  handler: RouteHandler<P>,
  path: string,
  params: P = {} as P,
  init?: RequestInit,
): Promise<Response> {
  return handler(new Request(new URL(path, 'http://t'), init), { params: Promise.resolve(params) })
}

/** Status-checked JSON body of a route response (fails loudly with the error body otherwise). */
export async function okJson<T>(res: Response): Promise<T> {
  const body: unknown = await res.json()
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`)
  return body as T
}
