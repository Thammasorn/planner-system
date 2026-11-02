// src/server/page-helpers.ts — page/layout loaders run authz first and throw NotFoundError for invisible resources;
// pages wrap them in orNotFound() so the response keeps its 404 status (M2-D21, r6a M2-16). No Suspense above it.
import 'server-only'
import { notFound } from 'next/navigation'
import { NotFoundError } from './errors'

/** Awaits a page loader; NotFoundError → notFound(). Everything else (incl. Next's redirect/notFound) is rethrown. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (e) {
    if (e instanceof NotFoundError) notFound()
    throw e
  }
}

/** M6.1-D5 / R15: `/p/<id>` of a task body redirects to `/t/<taskId>` — call it after the loader authorised the view
 *  (an invisible body is a 404 before this). DOC pages → null. */
export function taskIdOfTaskPage(view: { page: { kind?: string; taskId?: string | null } }): string | null {
  return view.page.kind === 'TASK' && view.page.taskId ? view.page.taskId : null
}

/** M11-D8: `/p/<id>` of a database row body redirects to `/r/<rowId>` — after the loader authorised the view (an
 *  invisible body is a 404 before this). Other kinds → null. */
export function rowIdOfRowPage(view: { page: { kind?: string; rowId?: string | null } }): string | null {
  return view.page.kind === 'DB_ROW' && view.page.rowId ? view.page.rowId : null
}
