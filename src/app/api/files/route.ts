// POST /api/files — multipart upload (SPEC §7.6 exception to "writes through actions", FILE-1…5, M4-D15/D16/D18).
// assertSameOrigin → Content-Length cap (413 before reading) → body length check (400) → fields → one transaction:
// requirePage(edit) → storeUpload → audit (X96) → 201 UploadedFileDTO. 413 PayloadTooLargeError, 415
// UnsupportedMediaTypeError. If anything after the write fails (audit, commit), the stored bytes are removed.
import { th } from '@/i18n/th'
import type { UploadedFileDTO } from '@/lib/contracts/files'
import { uploadFieldsSchema } from '@/lib/schemas/pages'
import * as audit from '@/server/audit'
import * as authz from '@/server/authz'
import { serverToday } from '@/server/clock'
import { db } from '@/server/db/client'
import { uploadLimits } from '@/server/env'
import { PayloadTooLargeError, ValidationError } from '@/server/errors'
import { assertSameOrigin } from '@/server/http/same-origin'
import { jsonResponse, route } from '@/server/route'
import { removeBestEffort, storeUpload } from '@/server/services/files'

const MIB = 1024 * 1024

const fieldError = (field: string, message: string): ValidationError =>
  new ValidationError({ [field]: [message] }, message)

export const POST = route(async (req, { user }): Promise<Response> => {
  assertSameOrigin(req)
  const limits = uploadLimits()
  const header = req.headers.get('content-length')
  if (header !== null && Number(header) > limits.attachmentBytes + MIB) throw new PayloadTooLargeError()
  const buf = await req.arrayBuffer()
  if (header !== null && buf.byteLength !== Number(header)) throw fieldError('file', th.files.errors.lengthMismatch)
  if (buf.byteLength > limits.attachmentBytes + MIB) throw new PayloadTooLargeError() // chunked bodies
  let form: FormData
  try {
    form = await new Response(buf, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData()
  } catch {
    throw fieldError('file', th.files.errors.missingFile)
  }
  const file = form.get('file')
  if (!(file instanceof File)) throw fieldError('file', th.files.errors.missingFile)
  const parsed = uploadFieldsSchema.safeParse({
    pageId: form.get('pageId') ?? undefined,
    purpose: form.get('purpose') ?? undefined,
  })
  if (!parsed.success) throw ValidationError.fromZod(parsed.error)
  const { pageId, purpose } = parsed.data
  const bytes = new Uint8Array(await file.arrayBuffer())
  const stored: { key?: string } = {}
  try {
    const dto = await db.transaction(async (tx): Promise<UploadedFileDTO> => {
      const a = await authz.requirePage(tx, user, pageId, 'edit') // invisible → 404, protected/archived → 403
      const out = await storeUpload(tx, user, a, {
        name: file.name,
        bytes,
        purpose,
        limits,
        today: serverToday(),
        onStored: (key) => {
          stored.key = key
        },
      })
      await audit.log(tx, user, {
        entity: 'file',
        entityId: out.id,
        action: 'create',
        projectId: a.page.projectId,
        summary: th.audit.fileUploaded(out.name),
        after: { name: out.name, size: out.size, kind: out.kind, mime: out.mime, pageId },
      })
      return out
    })
    return jsonResponse(dto, 201)
  } catch (e) {
    if (stored.key !== undefined) await removeBestEffort(stored.key)
    throw e
  }
})
