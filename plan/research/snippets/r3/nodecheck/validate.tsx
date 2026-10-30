// Can a Vitest (jsdom) unit test validate stored/template JSON against OUR schema
// by creating a headless editor? (no BlockNoteView, no mount)
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>");
for (const [k, v] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, DOMParser: dom.window.DOMParser, getComputedStyle: dom.window.getComputedStyle, MutationObserver: dom.window.MutationObserver }))
  Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
const { BlockNoteEditor } = await import("@blocknote/core");
const { schema } = await import("../harness/src/schema");
const template = [
  { type: "quote", content: "สรุปโปรเจคในหนึ่งย่อหน้า: ทำอะไร ให้ใคร เพื่ออะไร" },
  { type: "heading", props: { level: 2 }, content: "ข้อมูลโปรเจค" },
  { type: "table", content: { type: "tableContent", headerRows: 1, rows: [{ cells: ["หัวข้อ", "รายละเอียด"] }, { cells: ["ลูกค้า", ""] }] } },
  { type: "checkListItem", content: "…" },
  { type: "subpage", props: { pageId: "00000000-0000-0000-0000-000000000000" } },
  { type: "paragraph", content: [{ type: "mention", props: { kind: "user", id: "u1" } }, " — กำหนด"] },
];
const t0 = performance.now();
const editor = BlockNoteEditor.create({ schema, initialContent: template as never });
const blocks = editor.document;
console.log("headless ok:", blocks.map((b) => b.type).join(","), "in", Math.round(performance.now() - t0), "ms; ids assigned:", blocks.every((b) => typeof b.id === "string" && b.id.length > 0));
// invalid content -> throws (use as validator)
for (const bad of [[{ type: "nope" }], [{ type: "heading", props: { level: 7 } }], [{ type: "subpage", props: { pageId: 5 } }], [{ type: "paragraph", content: [{ type: "mention", props: { kind: "team", id: "x" } }] }], []]) {
  try { BlockNoteEditor.create({ schema, initialContent: bad as never }); console.log("accepted:", JSON.stringify(bad)); }
  catch (e) { console.log("rejected:", JSON.stringify(bad), "->", (e as Error).message, "| cause:", String((e as Error).cause).slice(0, 120)); }
}
// HTML <-> blocks on the client editor instance (sync in 0.55)
const html = "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>";
console.log("tryParseHTMLToBlocks sync:", JSON.stringify(editor.tryParseHTMLToBlocks(html).map((b) => [b.type, (b.content as any)?.rows?.length])));
console.log("blocksToMarkdownLossy:", JSON.stringify(editor.blocksToMarkdownLossy(blocks.slice(0, 3))).slice(0, 300));
