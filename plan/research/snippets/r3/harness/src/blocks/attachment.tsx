// Replacement for BlockNote's default `file` block (FR-527): same type name "file"
// (BlockNote's paste/drop code falls back to the hard-coded type "file" for any
// non-image file), same props (name/url/caption/backgroundColor) so the default
// toolbar buttons (download/rename/replace/caption/delete) keep working, plus `size`.
import { defaultProps, fileParse } from "@blocknote/core";
import { FilePanelExtension } from "@blocknote/core/extensions";
import { createReactBlockSpec } from "@blocknote/react";
import { useSyncExternalStore } from "react";
import { uploadStore } from "../lib/upload";
import { thEditor } from "../lib/th-editor";

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"] as const;
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export const createAttachmentBlock = createReactBlockSpec(
  {
    type: "file",
    propSchema: {
      backgroundColor: defaultProps.backgroundColor,
      name: { default: "" },
      url: { default: "" },
      caption: { default: "" },
      size: { default: 0 }, // bytes, from server response
    },
    content: "none",
  },
  {
    meta: { fileBlockAccept: ["*/*"] },
    parse: fileParse(),
    render: function AttachmentRender({ block, editor }) {
      const uploading = useSyncExternalStore(uploadStore.subscribe, () => uploadStore.has(block.id));
      const t = thEditor.attachment;
      if (uploading) {
        return <div className="att att-uploading" data-testid="att-uploading">{t.uploading}</div>;
      }
      if (block.props.url === "") {
        return (
          <div
            className="att att-empty"
            data-testid="att-empty"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!editor.isEditable) return;
              editor.transact(() => editor.getExtension(FilePanelExtension)?.showMenu(block.id));
            }}
          >
            📎 {thEditor.blocknote.file_blocks.add_button_text["file"]}
          </div>
        );
      }
      return (
        <div className="att" data-testid="att-card" contentEditable={false}>
          <span aria-hidden>📎</span>
          <a href={block.props.url} download={block.props.name} className="att-name">
            {block.props.name}
          </a>
          <span className="att-size" data-testid="att-size">{formatBytes(block.props.size)}</span>
          {block.props.caption && <div className="att-caption">{block.props.caption}</div>}
        </div>
      );
    },
    toExternalHTML: ({ block }) => (
      <a href={block.props.url}>{block.props.name || block.props.url}</a>
    ),
  },
);
