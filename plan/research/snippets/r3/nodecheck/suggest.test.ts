import { test } from "node:test";
import assert from "node:assert/strict";
import { rankSuggestionItems } from "../harness/src/lib/suggest.ts";
const items = [
  { title: "หัวข้อ 2", aliases: ["h2", "heading2", "subheading"], group: "หัวข้อ" },
  { title: "ย่อหน้า", aliases: ["p", "paragraph", "ข้อความ"], group: "บล็อกพื้นฐาน" },
  { title: "ตาราง", aliases: ["table"], group: "ขั้นสูง" },
  { title: "หน้า", aliases: ["page", "subpage", "หน้าย่อย"], group: "ขั้นสูง" },
  { title: "รูปภาพ", aliases: ["image", "img", "รูป"], group: "สื่อ" },
];
const t = (q: string) => rankSuggestionItems(items, q).map((i) => i.title);
test("exact Thai title beats substring (AC-504 '/หน้า')", () => assert.deepEqual(t("หน้า"), ["หน้า", "ย่อหน้า"]));
test("English alias finds Thai item (FR-520 '/table')", () => assert.deepEqual(t("table"), ["ตาราง"]));
test("Thai prefix ('/รูป')", () => assert.deepEqual(t("รูป"), ["รูปภาพ"]));
test("case-insensitive + trim", () => assert.deepEqual(t("  TABLE "), ["ตาราง"]));
test("empty query keeps original order", () => assert.equal(t("").length, items.length));
test("groups stay contiguous", () => {
  const r = rankSuggestionItems(items, "a"); // many substring hits
  const groups = r.map((i) => i.group);
  const seen = new Set<string>(); let prev = "";
  for (const g of groups) { if (g !== prev) { assert.ok(!seen.has(g!), "group repeated: " + g); seen.add(g!); prev = g!; } }
});
