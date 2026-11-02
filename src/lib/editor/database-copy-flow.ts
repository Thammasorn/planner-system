// src/lib/editor/database-copy-flow.ts — what the page editor does with database blocks a paste inserted
// (FR-1471, M11-D13). Client module; the server action is injected (PageEditor passes `copyDatabase`), so the flow
// is testable with a real headless editor.
// Copy: the block shows "กำลังคัดลอกฐานข้อมูล…" → target page id (a task body without a row creates it first) →
// copyDatabase({ sourcePageId, sourceDatabaseId, targetPageId }) → the block's `databaseId` becomes the copy's.
// Failure: toast, the id stays → the block renders "ไม่พบฐานข้อมูล" when the database is not this page's (FR-1464).
import type { AppEditor } from '@/components/editor/schema'
import { th } from '@/i18n/th'
import { setDatabaseBlockPhase } from './database-block-state'
import { type DatabasePasteDecision, planDatabasePaste } from './database-clipboard'
import type { PasteDatabaseHook } from './paste'

export interface DatabaseCopyDeps {
  /** The page being edited, or null (a task body without a row yet). */
  currentPageId: () => string | null
  /** Known id, or ensure the row first (memoised; rejects when it cannot be created — already toasted). */
  getPageId: () => Promise<string>
  copyDatabase: (input: {
    sourcePageId: string
    sourceDatabaseId: string
    targetPageId: string
  }) => Promise<{ databaseId: string }>
  notify: (message: string) => void
}

type BlockEditor = Pick<AppEditor, 'getBlock' | 'updateBlock'>

async function copyOne(
  editor: BlockEditor,
  d: Extract<DatabasePasteDecision, { action: 'copy' }>,
  deps: DatabaseCopyDeps,
): Promise<void> {
  setDatabaseBlockPhase(d.blockId, 'copying')
  try {
    const targetPageId = await deps.getPageId()
    const r = await deps.copyDatabase({
      sourcePageId: d.sourcePageId,
      sourceDatabaseId: d.databaseId,
      targetPageId,
    })
    if (editor.getBlock(d.blockId)) editor.updateBlock(d.blockId, { props: { databaseId: r.databaseId } })
  } catch {
    deps.notify(th.database.toasts.copyFailed)
  } finally {
    setDatabaseBlockPhase(d.blockId, null)
  }
}

/** Runs every copy decision (in parallel; Next serialises the actions). Resolves when all are settled. */
export async function runDatabasePaste(
  editor: BlockEditor,
  decisions: DatabasePasteDecision[],
  deps: DatabaseCopyDeps,
): Promise<void> {
  await Promise.all(
    decisions.flatMap((d) => (d.action === 'copy' ? [copyOne(editor, d, deps)] : [])),
  )
}

/** The `onDatabaseBlocksPasted` hook of makePasteHandler: plan (copy vs keep), then run the copies. */
export function makeDatabasePasteHook(deps: DatabaseCopyDeps): PasteDatabaseHook {
  return ({ editor, before, clip }) => {
    const decisions = planDatabasePaste({
      before,
      after: editor.document,
      clip,
      currentPageId: deps.currentPageId(),
    })
    return runDatabasePaste(editor, decisions, deps)
  }
}
