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
