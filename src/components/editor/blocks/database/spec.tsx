'use client'
// src/components/editor/blocks/database/spec.tsx — the `database` block (FR-1401…1408, §7.7, M11-D13/D21): a non-text
// island holding only `databaseId`; the data lives in the database tables and is read through authz at render time.
// `meta.selectable = false` → BlockNote's node view stops every event from inside (keys, paste, mouse, drag), so a
// Backspace in a cell edits the cell; the block handle (side menu) still selects / deletes / drags the whole block
// and the editor's Cmd+Z brings it back. Inside the island Cmd+Z is the database's own undo stack (IslandFrame).
import { createReactBlockSpec } from '@blocknote/react'
import { th } from '@/i18n/th'
import { databaseTitleOf } from '@/lib/editor/database-block-state'
import { DatabaseBlock } from './DatabaseBlock'

export const createDatabaseBlock = createReactBlockSpec(
  {
    type: 'database',
    content: 'none',
    propSchema: { databaseId: { default: '' } },
  },
  {
    meta: { selectable: false },
    render: ({ block, editor }) => (
      <DatabaseBlock blockId={block.id} databaseId={block.props.databaseId} editorEditable={editor.isEditable} />
    ),
    // copy to other apps: the database title only, never the data (M11-D13); internal copies keep the id
    toExternalHTML: ({ block }) => <p>{databaseTitleOf(block.props.databaseId) || th.database.untitled}</p>,
  },
)
