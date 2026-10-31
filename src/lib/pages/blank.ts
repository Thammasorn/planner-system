// src/lib/pages/blank.ts — "blank page" for the template chooser (FR-507, M4-D7): no title and no content
// (an empty document, or only empty paragraphs without children).

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x)

function hasText(content: unknown): boolean {
  if (content === undefined || content === null) return false
  if (typeof content === 'string') return content.length > 0
  if (!Array.isArray(content)) return true // table content or something unknown
  return content.some((ic) => {
    if (typeof ic === 'string') return ic.length > 0
    if (!isObj(ic)) return false
    if (ic.type === 'text') return typeof ic.text === 'string' && ic.text.length > 0
    return true // link, mention, custom inline content
  })
}

export function isBlankPage(p: { title: string; content: unknown }): boolean {
  if (p.title !== '') return false
  if (!Array.isArray(p.content)) return false
  return p.content.every(
    (b) =>
      isObj(b) &&
      b.type === 'paragraph' &&
      !hasText(b.content) &&
      (b.children === undefined || (Array.isArray(b.children) && b.children.length === 0)),
  )
}
