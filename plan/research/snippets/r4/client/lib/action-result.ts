// Shape returned by the internal `action()` wrapper (SPEC §7.3): never throw across the wire.
export type ActionOk<T> = { ok: true } & T
export type ActionFail<C extends string = string, E = unknown> = {
  ok: false
  code: C
  message: string
  fieldErrors?: Record<string, string[] | undefined>
  extra?: E
}
export type ActionResult<T, C extends string = string, E = unknown> = ActionOk<T> | ActionFail<C, E>

export class ActionError<C extends string = string, E = unknown> extends Error {
  readonly code: C
  readonly fieldErrors: Record<string, string[] | undefined> | undefined
  readonly extra: E | undefined
  constructor(fail: ActionFail<C, E>) {
    super(fail.message)
    this.name = 'ActionError'
    this.code = fail.code
    this.fieldErrors = fail.fieldErrors
    this.extra = fail.extra
  }
}

/** Turn `{ ok:false }` into a thrown ActionError so TanStack `onError` (rollback) fires. */
export function unwrap<T, C extends string, E>(res: ActionResult<T, C, E>): ActionOk<T> {
  if (!res.ok) throw new ActionError<C, E>(res)
  return res
}
