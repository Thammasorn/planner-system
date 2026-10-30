// Custom BlockNote pasteHandler (FR-524, FR-525, SPEC §7.6/§7.7).
import type { AppEditor } from "../schema";
import { gridToHtmlTable, parseTsvGrid } from "./tsv";
import { insertFilesAtCursor, type Notify } from "./upload";
import { thEditor } from "./th-editor";

type DefaultPasteHandler = (ctx?: { prioritizeMarkdownOverHTML?: boolean; plainTextAsMarkdown?: boolean }) => boolean | undefined;
/** Same shape as BlockNoteEditorOptions["pasteHandler"], typed with our schema (no `any`). */
export type PasteHandler = (ctx: { event: ClipboardEvent; editor: AppEditor; defaultPasteHandler: DefaultPasteHandler }) => boolean | undefined;

const HAS_TABLE = /<table[\s>]/i;
const HAS_IMG = /<img[\s>]/i;

/** MVP: no hot-linked external images (offline server, CSP img-src 'self').
 *  Replace <img src="http..."> with a link so nothing is lost. */
export function externalImagesToLinks(html: string, doc: Document = document): string {
  const tpl = doc.createElement("template");
  tpl.innerHTML = html;
  for (const img of Array.from(tpl.content.querySelectorAll("img"))) {
    const src = img.getAttribute("src") ?? "";
    if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) {
      const a = doc.createElement("a");
      if (!src.startsWith("data:")) a.href = src;
      a.textContent = img.getAttribute("alt") || thEditor.pasteImageLinkFallback;
      img.replaceWith(a);
    }
  }
  return tpl.innerHTML;
}

/** true when the HTML carries visible text (ignoring <style>/<script>/<meta>), e.g. Word/PowerPoint
 *  put an extra PNG rendering on the clipboard - we must paste their HTML, not the picture. */
export function htmlHasText(html: string, doc: Document = document): boolean {
  const tpl = doc.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll("style,script,meta,link,title").forEach((n) => n.remove());
  return (tpl.content.textContent ?? "").trim().length > 0;
}

export function makePasteHandler(notify: Notify): PasteHandler {
  return ({ event, editor, defaultPasteHandler }) => {
    // test hook: compare against BlockNote's stock behaviour
    if ((globalThis as { __pasteMode?: string }).__pasteMode === "default") return defaultPasteHandler();
    const dt = event.clipboardData;
    if (!dt) return defaultPasteHandler();
    const types = Array.from(dt.types);

    // 1) BlockNote-internal copy (keeps subpage/mention/custom blocks exactly) -> default.
    if (types.includes("blocknote/html")) return defaultPasteHandler();

    const html = types.includes("text/html") ? dt.getData("text/html") : "";
    const text = types.includes("text/plain") ? dt.getData("text/plain") : "";

    // 2) Spreadsheet HTML (Excel / Google Sheets / Numbers / Word tables):
    //    bypass BlockNote's markdown sniffing of text/plain (isMarkdown() false-positives
    //    on e.g. "task_name_1", "a@b_c.com", "1. x\n2. y" would drop the table).
    if (HAS_TABLE.test(html)) {
      editor.pasteHTML(HAS_IMG.test(html) ? externalImagesToLinks(html) : html);
      return true;
    }

    // 3) Files (screenshots, files copied in Finder/Explorer, browser "Copy image").
    //    Only when there is no meaningful HTML text (see htmlHasText).
    const files = Array.from(dt.files);
    if (files.length > 0 && (!html || !htmlHasText(html))) {
      void insertFilesAtCursor(editor, files, notify);
      return true;
    }

    // 4) TSV only (no HTML): >=2 rows x >=2 cols rectangular grid -> table.
    if (!html) {
      const grid = parseTsvGrid(text);
      if (grid) {
        editor.pasteHTML(gridToHtmlTable(grid));
        return true;
      }
    }

    // 5) Other HTML with external images -> links instead of hot-linked images.
    if (HAS_IMG.test(html)) {
      editor.pasteHTML(externalImagesToLinks(html));
      return true;
    }

    // 6) Everything else: BlockNote default, but prefer HTML over markdown-sniffed text.
    return defaultPasteHandler({ prioritizeMarkdownOverHTML: false, plainTextAsMarkdown: true });
  };
}
