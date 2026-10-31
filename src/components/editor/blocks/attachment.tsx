'use client'
// src/components/editor/blocks/attachment.tsx — replacement for BlockNote's default `file` block (FR-527).
// From plan/research/snippets/r3/harness/src/blocks/attachment.tsx. Same type name "file" (BlockNote's paste/drop
// code falls back to the hard-coded type "file" for any non-image file) and the same props, so the default
// toolbar buttons (download / rename / replace / caption / delete) keep working, plus `size` (bytes).
import { defaultProps, fileParse } from '@blocknote/core'
import { FilePanelExtension } from '@blocknote/core/extensions'
import { createReactBlockSpec } from '@blocknote/react'
import { type JSX, useSyncExternalStore } from 'react'
import { th } from '@/i18n/th'
import { uploadStore } from '@/lib/editor/upload'
import { formatBytes } from '@/lib/files/format-bytes'

export interface AttachmentCardProps {
  blockId: string
  url: string
  name: string
  size: number
  caption: string
  /** Opens the upload panel for an empty block (editable editors only). */
  onPick?: (() => void) | undefined
}

export function AttachmentCard(p: AttachmentCardProps): JSX.Element {
  // NOT BlockNote's useUploadLoading(): it subscribes in an effect and misses the start event of a block that mounts
  // in the same tick as uploadFile() (r3 G10). A store read during render has no such race.
  const uploading = useSyncExternalStore(
    uploadStore.subscribe,
    () => uploadStore.has(p.blockId),
    () => false,
  )
  const t = th.editor.attachment
  if (uploading) {
    return (
      <div className="att att-uploading" data-testid="att-uploading" role="status">
        <span aria-hidden>📎</span> {t.uploading}
      </div>
    )
  }
  if (p.url === '') {
    return (
      <div
        className="att att-empty"
        data-testid="att-empty"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => p.onPick?.()}
      >
        <span aria-hidden>📎</span> {th.editor.blocknote.file_blocks.add_button_text.file}
      </div>
    )
  }
  return (
    <div className="att" data-testid="att-card" contentEditable={false}>
      <span aria-hidden>📎</span>
      <a href={p.url} download={p.name} className="att-name" aria-label={t.download(p.name)}>
        {p.name}
      </a>
      <span className="att-size" data-testid="att-size">
        {formatBytes(p.size)}
      </span>
      {p.caption !== '' && <div className="att-caption">{p.caption}</div>}
    </div>
  )
}

export const createAttachmentBlock = createReactBlockSpec(
  {
    type: 'file',
    propSchema: {
      backgroundColor: defaultProps.backgroundColor,
      name: { default: '' },
      url: { default: '' },
      caption: { default: '' },
      size: { default: 0 },
    },
    content: 'none',
  },
  {
    meta: { fileBlockAccept: ['*/*'] }, // keeps it a "file block" for the toolbar buttons + file panel
    parse: fileParse(),
    render: ({ block, editor }) => (
      <AttachmentCard
        blockId={block.id}
        url={block.props.url}
        name={block.props.name}
        size={block.props.size}
        caption={block.props.caption}
        onPick={() => {
          if (!editor.isEditable) return
          editor.transact(() => editor.getExtension(FilePanelExtension)?.showMenu(block.id))
        }}
      />
    ),
    toExternalHTML: ({ block }) => <a href={block.props.url}>{block.props.name || block.props.url}</a>,
  },
)
