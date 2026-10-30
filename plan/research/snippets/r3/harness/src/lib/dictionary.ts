// Builds the BlockNote Dictionary used by the editor:
//   Thai titles/subtexts/groups (from th.ts) + English aliases & English title
//   kept as search aliases, so both "/ตาราง" and "/table" find the table item (FR-520).
import type { Dictionary } from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import { thEditor } from "./th-editor";

type SlashKey = keyof Dictionary["slash_menu"];

function uniq(xs: readonly string[]): string[] {
  return [...new Set(xs.map((x) => x.trim()).filter((x) => x.length > 0))];
}

export function buildThaiDictionary(): Dictionary {
  const th = thEditor.blocknote;
  const slash = {} as Dictionary["slash_menu"];
  for (const key of Object.keys(en.slash_menu) as SlashKey[]) {
    const e = en.slash_menu[key];
    const t = th.slash_menu[key];
    slash[key] = {
      title: t.title,
      subtext: t.subtext,
      group: t.group,
      // English title + English aliases + Thai aliases -> all searchable
      aliases: uniq([e.title.toLowerCase(), ...e.aliases, ...t.aliases]),
    };
  }
  return { ...th, slash_menu: slash };
}

export const thaiDictionary: Dictionary = buildThaiDictionary();
