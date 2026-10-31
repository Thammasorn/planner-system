// src/lib/editor/dictionary.ts — the BlockNote Dictionary the editor uses (FR-520, r3 §6). Client module.
// From plan/research/snippets/r3/harness/src/lib/dictionary.ts: Thai titles / subtexts / groups from
// th.editor.blocknote, plus the English title and English aliases kept as search aliases, so both "/ตาราง" and
// "/table" find the table item.
import type { Dictionary } from '@blocknote/core'
import { en } from '@blocknote/core/locales'
import { th } from '@/i18n/th'

type SlashKey = keyof Dictionary['slash_menu']

function uniq(xs: readonly string[]): string[] {
  return [...new Set(xs.map((x) => x.trim()).filter((x) => x.length > 0))]
}

export function buildThaiDictionary(): Dictionary {
  const bn = th.editor.blocknote
  const slash = {} as Dictionary['slash_menu']
  for (const key of Object.keys(en.slash_menu) as SlashKey[]) {
    const e = en.slash_menu[key]
    const t = bn.slash_menu[key]
    slash[key] = {
      title: t.title,
      subtext: t.subtext,
      group: t.group,
      aliases: uniq([e.title.toLowerCase(), ...e.aliases, ...t.aliases]),
    }
  }
  return { ...bn, slash_menu: slash }
}

export const thaiDictionary: Dictionary = buildThaiDictionary()
