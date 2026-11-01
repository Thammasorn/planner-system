// PUT /api/pages/[id]/content — keepalive leave-page save (FR-531, DEVIATION M4-D2, ≤ 60 KB from the client; the body
// is capped at 2 MB here). assertSameOrigin → keepaliveSaveBodySchema → one transaction: requirePage(edit) →
// savePageContent → audit (X96, same row as the savePageContent action) → SavePageResult. Serves task bodies too
// (M6.1: requirePage forwards a TASK page to requireTask, FR-687).
import { th } from '@/i18n/th'
import type { SavePageResult } from '@/lib/contracts/pages'
import { PAGE_CONTENT_MAX_BYTES } from '@/lib/schemas/page-content'
import { keepaliveSaveBodySchema } from '@/lib/schemas/pages'
import * as audit from '@/server/audit'
import * as authz from '@/server/authz'
import { db } from '@/server/db/client'
import { ValidationError } from '@/server/errors'
import { assertSameOrigin } from '@/server/http/same-origin'
import { route } from '@/server/route'
import { saveAuditInput, savePageContent } from '@/server/services/pages'

const MAX_BODY_BYTES = PAGE_CONTENT_MAX_BYTES + 64 * 1024 // content + the JSON envelope

const tooLarge = (): ValidationError => {
  const msg = th.pages.errors.contentTooLarge
  return new ValidationError({ content: [msg] }, msg)
}

export const PUT = route<{ id: string }>(async (req, { user, params }): Promise<SavePageResult> => {
  assertSameOrigin(req)
  const header = req.headers.get('content-length')
  if (header !== null && Number(header) > MAX_BODY_BYTES) throw tooLarge()
  const text = await req.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw tooLarge()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    const msg = th.pages.errors.contentInvalid
    throw new ValidationError({ content: [msg] }, msg)
  }
  const parsed = keepaliveSaveBodySchema.safeParse(body)
  if (!parsed.success) throw ValidationError.fromZod(parsed.error)
  const input = parsed.data
  return db.transaction(async (tx) => {
    const a = await authz.requirePage(tx, user, params.id, 'edit') // deleted / invisible → 404, protected → 403
    const res = await savePageContent(tx, user, a, input) // task body: subpage → 400 (M6.1-D9)
    await audit.log(tx, user, saveAuditInput(a, res.version)) // same row as the action (FR-693, M6.1-D10)
    return res
  })
})
