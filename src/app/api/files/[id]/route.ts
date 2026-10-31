// GET /api/files/[id] — authorised download (FILE-6/7, M4-D17): requireFile (project_id only; invisible → 404,
// AC-503), streamed with nosniff + Content-Disposition; attachments (SVG included) get CSP sandbox. A malformed id or
// a row whose bytes are missing is a 404 (X86).
import { db } from '@/server/db/client'
import { route } from '@/server/route'
import { openDownload } from '@/server/services/files'

export const GET = route<{ id: string }>((_req, { user, params }): Promise<Response> =>
  openDownload(db, user, params.id),
)
