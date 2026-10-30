"use client";
import "./editor-theme.css"; // deliberately BEFORE BlockNote CSS: selectors are specificity-proof
import "@blocknote/mantine/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import {
  type DefaultReactSuggestionItem,
  FilePanelController,
  GridSuggestionMenuController,
  type FilePanelProps,
  SuggestionMenuController,
  UploadTab,
  useComponentsContext,
  useCreateBlockNote,
  useDictionary,
} from "@blocknote/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type AppEditor, type AppPartialBlock, schema } from "./schema";
import { thaiDictionary } from "./lib/dictionary";
import { makeUploadFile } from "./lib/upload";
import { makePasteHandler } from "./lib/paste";
import { getSlashItemsFiltered, type SlashCtx } from "./slashMenu";
import { atWordStart, rankSuggestionItems, slashShouldOpen } from "./lib/suggest";

/** File panel with ONLY the upload tab (no "embed URL": external images unsupported in MVP). */
function UploadOnlyFilePanel(props: FilePanelProps) {
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const [loading, setLoading] = useState(false);
  const name = dict.file_panel.upload.title;
  return (
    <Components.FilePanel.Root
      className="bn-panel"
      tabs={[{ name, tabPanel: <UploadTab blockId={props.blockId} setLoading={setLoading} /> }]}
      openTab={name}
      setOpenTab={() => {}}
      defaultOpenTab={name}
      loading={loading}
    />
  );
}

type MentionTarget = { kind: "user" | "page"; id: string; label: string; sub?: string };

export type EditorProps = {
  pageId: string;
  loadVersion: number; // bump to re-create editor with fresh server content
  initialContent: AppPartialBlock[]; // from DB (may be [])
  editable: boolean;
  theme: "light" | "dark";
  onSave: (doc: unknown) => void;
  createSubpage: SlashCtx["createSubpage"];
  searchMentions: (q: string) => Promise<MentionTarget[]>;
  notify: (msg: string) => void;
};

export function Editor(props: EditorProps) {
  const editorRef = useRef<AppEditor | null>(null);
  const editor = useCreateBlockNote(
    {
      schema,
      dictionary: thaiDictionary,
      // BlockNote THROWS on [] ("initialContent must be a non-empty array") -> pass undefined
      initialContent: props.initialContent.length > 0 ? props.initialContent : undefined,
      uploadFile: makeUploadFile({ pageId: props.pageId, notify: props.notify, getEditor: () => editorRef.current }),
      pasteHandler: makePasteHandler(props.notify),
      tables: { headers: true, cellBackgroundColor: true, cellTextColor: false, splitCells: false },
      trailingBlock: true,
      animations: true,
    },
    [props.pageId, props.loadVersion],
  );
  editorRef.current = editor;

  // expose for Playwright
  useEffect(() => {
    (window as unknown as { __bn: unknown }).__bn = editor;
  }, [editor]);

  // debounced autosave 800ms (FR-531)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"idle" | "dirty" | "saved">("idle");
  const flush = useMemo(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      props.onSave(editor.document);
      setStatus("saved");
    },
    [editor, props],
  );

  const slashCtx: SlashCtx = { createSubpage: props.createSubpage, notify: props.notify };

  return (
    <div>
      <div data-testid="save-status">{status}</div>
      <BlockNoteView
        editor={editor}
        editable={props.editable}
        theme={props.theme}
        slashMenu={false}
        emojiPicker={false}
        filePanel={false}
        onChange={() => {
          setStatus("dirty");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, 800);
        }}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={(q) => getSlashItemsFiltered(editor, slashCtx, q)}
          shouldOpen={slashShouldOpen}
        />
        {/* emoji picker: same as BlockNote default, but only at word start ("10:30" must not become 10🕒) */}
        <GridSuggestionMenuController triggerCharacter=":" columns={10} minQueryLength={2} shouldOpen={atWordStart} />
        <SuggestionMenuController
          triggerCharacter="@"
          shouldOpen={atWordStart}
          getItems={async (q): Promise<DefaultReactSuggestionItem[]> => {
            const targets = await props.searchMentions(q);
            return rankSuggestionItems(
              targets.map((t) => ({
                title: t.label,
                subtext: t.sub,
                aliases: [t.id],
                group: t.kind === "user" ? "คน" : "หน้า",
                onItemClick: () => {
                  editor.insertInlineContent([{ type: "mention", props: { kind: t.kind, id: t.id } }, " "]);
                },
              })),
              q,
            );
          }}
        />
        <FilePanelController filePanel={UploadOnlyFilePanel} />
      </BlockNoteView>
    </div>
  );
}
