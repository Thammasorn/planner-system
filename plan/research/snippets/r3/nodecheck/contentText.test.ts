// Run: node --test nodecheck/contentText.test.ts   (Node >= 23 strips TS types natively)
// In the app these become Vitest cases in src/lib/editor/content-text.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectMentionIds, extractContentText } from "../harness/src/lib/contentText.ts";

const complex = JSON.parse(readFileSync(new URL("../fixtures/complex-doc.json", import.meta.url), "utf8"));
const names: Record<string, string> = { "u-cindy": "Cindy", "u-ivy": "Ivy" };

test("real editor.document (captured from BlockNote 0.55 in Chromium)", () => {
  const t = extractContentText(complex, { userName: (id) => names[id] });
  assert.equal(
    t,
    "ตัวหนาและปกติ ดูที่ สเปก แล้วคุยกับ @Cindy และหน้า ข้อแม่ ข้อลูก หลาน ชื่อ บทบาท @Ivy Dev select * from pages; screenshot.png ภาพหน้าจอ สัญญา.pdf พับได้ ซ่อนอยู่ คำพูด",
  );
});

test("styled runs are joined without separators (Thai word stays searchable)", () => {
  const t = extractContentText([{ type: "paragraph", content: [{ type: "text", text: "ตัว", styles: {} }, { type: "text", text: "หนา", styles: { bold: true } }] }]);
  assert.equal(t, "ตัวหนา");
});

test("page mentions and subpage cards are not indexed; user mentions only with resolver", () => {
  const doc = [{ type: "paragraph", content: [{ type: "mention", props: { kind: "page", id: "p1" } }, { type: "mention", props: { kind: "user", id: "u-cindy" } }] }, { type: "subpage", props: { pageId: "p2" } }];
  assert.equal(extractContentText(doc), "");
  assert.equal(extractContentText(doc, { userName: (id) => names[id] }), "@Cindy");
});

test("PartialBlock shorthands (templates): string content, string cells, no ids/props/children", () => {
  const doc = [
    { type: "heading", props: { level: 2 }, content: "ข้อมูลโปรเจค" },
    { type: "table", content: { type: "tableContent", rows: [{ cells: ["หัวข้อ", "รายละเอียด"] }, { cells: ["ลูกค้า", ""] }] } },
    { type: "checkListItem", content: ["เป้าหมาย ", { type: "text", text: "หนึ่ง", styles: {} }] },
  ];
  assert.equal(extractContentText(doc), "ข้อมูลโปรเจค หัวข้อ รายละเอียด ลูกค้า เป้าหมาย หนึ่ง");
});

test("whitespace/newlines collapse; zero-width chars removed; NFC", () => {
  const doc = [{ type: "paragraph", content: "บรรทัด1\nบรรทัด2\t\t  จบ" }, { type: "paragraph", content: "ภา​ษา" }, { type: "paragraph" }, { type: "divider" }];
  assert.equal(extractContentText(doc), "บรรทัด1 บรรทัด2 จบ ภาษา");
});

test("hostile input never throws", () => {
  for (const bad of [null, undefined, 42, "x", {}, [null, 1, "s", [], { type: 5 }, { content: { type: "tableContent", rows: "no" } }], [{ type: "table", content: { type: "tableContent", rows: [null, { cells: [null, 7, { type: "tableCell" }] }] } }]]) {
    assert.doesNotThrow(() => extractContentText(bad));
  }
});

test("depth cap prevents stack overflow on 100k-deep children", () => {
  let node: Record<string, unknown> = { type: "paragraph", content: "ลึก" };
  for (let i = 0; i < 100_000; i++) node = { type: "bulletListItem", content: "x", children: [node] };
  const t = extractContentText([node]);
  assert.ok(t.startsWith("x x x"));
  assert.ok(!t.includes("ลึก"));
});

test("maxLength cap", () => {
  const doc = [{ type: "paragraph", content: "ก".repeat(300_000) }];
  assert.equal(extractContentText(doc).length, 200_000);
  assert.equal(extractContentText(doc, { maxLength: 10 }).length, 10);
});

test("collectMentionIds finds users/pages incl. table cells and subpage cards", () => {
  const ids = collectMentionIds(complex);
  assert.deepEqual([...ids.users].sort(), ["u-cindy", "u-ivy"]);
  assert.deepEqual([...ids.pages].sort(), ["p-child", "p-secret"]);
});
