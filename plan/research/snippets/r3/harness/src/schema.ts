import {
  BlockNoteSchema,
  createHeadingBlockSpec,
  createImageBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
} from "@blocknote/core";
import { createAttachmentBlock } from "./blocks/attachment";
import { createSubpageBlock } from "./blocks/subpage";
import { Mention } from "./inline/mention";
import { IMAGE_MIME } from "./lib/upload";

// Drop blocks we don't support (audio/video: no upload types for them in SPEC §7.6),
// replace heading (H1–H3 only, FR-521), image (no SVG / only 4 raster types),
// file (adds size, FR-527).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { audio: _audio, video: _video, file: _file, heading: _heading, image: _image, ...keptBlocks } = defaultBlockSpecs;

const baseImage = createImageBlockSpec();
const imageSpec = {
  ...baseImage,
  implementation: {
    ...baseImage.implementation,
    meta: { ...baseImage.implementation.meta, fileBlockAccept: [...IMAGE_MIME] },
  },
};

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...keptBlocks, // paragraph, bulletListItem, numberedListItem, checkListItem, toggleListItem, quote, codeBlock, divider, table
    heading: createHeadingBlockSpec({ levels: [1, 2, 3], allowToggleHeadings: false }),
    image: imageSpec,
    file: createAttachmentBlock(),
    subpage: createSubpageBlock(),
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
  styleSpecs: defaultStyleSpecs,
});

export type AppSchema = typeof schema;
export type AppEditor = typeof schema.BlockNoteEditor;
export type AppBlock = typeof schema.Block;
export type AppPartialBlock = typeof schema.PartialBlock;
