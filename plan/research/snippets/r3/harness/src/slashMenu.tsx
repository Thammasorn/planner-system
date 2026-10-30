import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { rankSuggestionItems } from "./lib/suggest";
import { type DefaultReactSuggestionItem, getDefaultReactSlashMenuItems } from "@blocknote/react";
import type { AppEditor } from "./schema";
import { thEditor } from "./lib/th-editor";

export type SlashCtx = {
  /** server action: create child page under current page; returns new id or null */
  createSubpage: () => Promise<string | null>;
  notify: (msg: string) => void;
};

export function getSlashMenuItems(editor: AppEditor, ctx: SlashCtx): DefaultReactSuggestionItem[] {
  const dict = editor.dictionary;
  const out: DefaultReactSuggestionItem[] = [];
  for (const item of getDefaultReactSlashMenuItems(editor)) {
    if (item.title === dict.slash_menu.table.title) {
      // AC-501: "/ตาราง" must give a 3x3 table (BlockNote's default inserts 2 rows x 3 cols)
      out.push({
        ...item,
        onItemClick: () => {
          insertOrUpdateBlockForSlashMenu(editor, {
            type: "table",
            content: {
              type: "tableContent",
              rows: [{ cells: ["", "", ""] }, { cells: ["", "", ""] }, { cells: ["", "", ""] }],
            },
          });
        },
      });
      // "/หน้า" right after table so the "ขั้นสูง" group stays contiguous
      const s = thEditor.slash.subpage;
      out.push({
        title: s.title,
        subtext: s.subtext,
        aliases: [...s.aliases],
        group: s.group,
        icon: <span aria-hidden>📄</span>,
        onItemClick: () => {
          // insert immediately (card shows "กำลังสร้างหน้า…"), then fill pageId
          const block = insertOrUpdateBlockForSlashMenu(editor, { type: "subpage", props: { pageId: "" } });
          void ctx.createSubpage().then((id) => {
            if (!editor.getBlock(block.id)) return;
            if (id) editor.updateBlock(block.id, { props: { pageId: id } });
            else editor.removeBlocks([block.id]);
          });
        },
      });
      continue;
    }
    out.push(item);
  }
  return out;
}

export async function getSlashItemsFiltered(editor: AppEditor, ctx: SlashCtx, query: string) {
  return rankSuggestionItems(getSlashMenuItems(editor, ctx), query);
}
