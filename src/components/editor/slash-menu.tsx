'use client'
// src/components/editor/slash-menu.tsx — Thai slash menu (FR-506/520/528, AC-501/504, M4-D14, r3 §5.2).
// From plan/research/snippets/r3/harness/src/slashMenu.tsx: BlockNote's default items (titles come from the Thai
// dictionary, English aliases stay searchable), `/ตาราง` → 3×3, custom `/หน้า` (create a child page, insert its
// card) when allowed (never in a TASK body, M6.1-D9), ranked filter, word-start guard, stable getItems (r3 G23).
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import ViewKanbanOutlined from '@mui/icons-material/ViewKanbanOutlined'
import {
  type DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
} from '@blocknote/react'
import { type JSX, useCallback } from 'react'
import { th } from '@/i18n/th'
import type { PageKind, PageSpace } from '@/lib/contracts/pages'
import { rankSuggestionItems, slashShouldOpen } from '@/lib/editor/suggest'
import type { AppEditor } from './schema'

export interface SlashCtx {
  /** Creates the child page (server action) and resolves its id, or null after a failure (already toasted). */
  createSubpage: () => Promise<string | null>
  /** canEdit && depth < 9 (FR-502: at most 10 levels). */
  canCreateSubpage: boolean
  /** M6.1-D9 (FR-680): a TASK body has no page tree → never the sub-page item. Default 'DOC'. */
  kind?: PageKind
  /** M10-D5: the live blocks are offered on PROJECT pages only. Default 'WORKSPACE'. */
  space?: PageSpace
  /** M10-D5: the viewer may edit the page (the live items are offered only then). Default false. */
  canEdit?: boolean
}

const EMPTY_ROW = (): { cells: string[] } => ({ cells: ['', '', ''] })

function subpageItem(editor: AppEditor, ctx: SlashCtx): DefaultReactSuggestionItem {
  const s = th.editor.slash.subpage
  return {
    title: s.title,
    subtext: s.subtext,
    aliases: [...s.aliases],
    group: s.group,
    icon: <span aria-hidden>📄</span>,
    onItemClick: () => {
      // Placeholder card first ("กำลังสร้างหน้า…") so the cursor stays put during the async call (M4-D14).
      const block = insertOrUpdateBlockForSlashMenu(editor, { type: 'subpage', props: { pageId: '' } })
      void ctx
        .createSubpage()
        .catch(() => null)
        .then((id) => {
          if (!editor.getBlock(block.id)) return
          if (id) editor.updateBlock(block.id, { props: { pageId: id } })
          else editor.removeBlocks([block.id])
        })
    },
  }
}

/** M10 (FR-1301/1303, M10-D5): "มุมมองงาน" and "ภาระทีม" — PROJECT documents the viewer may edit. */
function liveItems(editor: AppEditor, ctx: SlashCtx): DefaultReactSuggestionItem[] {
  if (ctx.space !== 'PROJECT' || ctx.canEdit !== true || (ctx.kind ?? 'DOC') !== 'DOC') return []
  const s = th.editor.slash
  return [
    {
      title: s.taskView.title,
      subtext: s.taskView.subtext,
      aliases: [...s.taskView.aliases],
      group: s.taskView.group,
      icon: <ViewKanbanOutlined fontSize="small" />,
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, { type: 'taskView', props: { view: 'BOARD' } })
      },
    },
    {
      title: s.projectWorkload.title,
      subtext: s.projectWorkload.subtext,
      aliases: [...s.projectWorkload.aliases],
      group: s.projectWorkload.group,
      icon: <GroupsOutlined fontSize="small" />,
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, { type: 'projectWorkload' })
      },
    },
  ]
}

export function getSlashMenuItems(editor: AppEditor, ctx: SlashCtx): DefaultReactSuggestionItem[] {
  const out: DefaultReactSuggestionItem[] = []
  for (const item of getDefaultReactSlashMenuItems(editor)) {
    // The runtime items still carry `key` although the React type omits it (r3 §5.2).
    if ('key' in item && item.key === 'table') {
      out.push({
        ...item,
        onItemClick: () => {
          insertOrUpdateBlockForSlashMenu(editor, {
            type: 'table',
            content: { type: 'tableContent', rows: [EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()] },
          })
        },
      })
      // Right after the table so the "ขั้นสูง" group stays contiguous.
      if (ctx.canCreateSubpage && (ctx.kind ?? 'DOC') === 'DOC') out.push(subpageItem(editor, ctx))
      out.push(...liveItems(editor, ctx)) // M10-D5: right after หน้า (their own "ข้อมูลสด" group)
      continue
    }
    out.push(item)
  }
  return out
}

export function SlashMenu({ editor, ctx }: { editor: AppEditor; ctx: SlashCtx }): JSX.Element {
  const getItems = useCallback(
    (query: string): Promise<DefaultReactSuggestionItem[]> => {
      try {
        return Promise.resolve(rankSuggestionItems(getSlashMenuItems(editor, ctx), query))
      } catch {
        return Promise.resolve([]) // a rejection would leave the menu loading (r3 §5)
      }
    },
    [editor, ctx],
  )
  return <SuggestionMenuController triggerCharacter="/" shouldOpen={slashShouldOpen} getItems={getItems} />
}
