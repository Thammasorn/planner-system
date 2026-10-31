// src/components/editor/schema.ts — the BlockNote schema of pages (FR-521…529, M4-D12, PLAN §3.11).
// From plan/research/snippets/r3/harness/src/schema.ts. Blocks are picked explicitly (no audio/video: §7.6 has no
// upload types for them); heading H1–H3 without toggle headings; image accepts only the 4 raster types (SVG falls
// through to the `file` attachment); `file` adds `size`; `subpage` card; `mention` inline content.
// Client/server parity: Object.keys(schema.blockSpecs) must equal BLOCK_TYPES (schema.test.ts, M4-D37a).
import {
  BlockNoteSchema,
  createHeadingBlockSpec,
  createImageBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from '@blocknote/core'
import { IMAGE_MIME } from '@/lib/files/upload-rules'
import { createAttachmentBlock } from './blocks/attachment'
import { createSubpageBlock } from './blocks/subpage'
import { Mention } from './inline/mention'

const {
  paragraph,
  bulletListItem,
  numberedListItem,
  checkListItem,
  toggleListItem,
  quote,
  codeBlock,
  divider,
  table,
} = defaultBlockSpecs

export const HEADING_LEVELS = [1, 2, 3] as const

const baseImage = createImageBlockSpec()
const image = {
  ...baseImage,
  implementation: {
    ...baseImage.implementation,
    meta: { ...baseImage.implementation.meta, fileBlockAccept: [...IMAGE_MIME] },
  },
}

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph,
    bulletListItem,
    numberedListItem,
    checkListItem,
    toggleListItem,
    quote,
    codeBlock,
    divider,
    table,
    heading: createHeadingBlockSpec({ levels: [...HEADING_LEVELS], allowToggleHeadings: false }),
    image,
    file: createAttachmentBlock(), // replaces the default "file" (adds size) — keep the type name "file"
    subpage: createSubpageBlock(),
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
  styleSpecs: defaultStyleSpecs, // bold italic underline strike code textColor backgroundColor (FR-522)
})

export type AppSchema = typeof schema
export type AppEditor = typeof schema.BlockNoteEditor
export type AppBlock = typeof schema.Block
export type AppPartialBlock = typeof schema.PartialBlock
