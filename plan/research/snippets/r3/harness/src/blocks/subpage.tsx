// Custom block: sub-page link card (FR-528, SPEC §7.7). props: { pageId }.
// Title/icon are NOT stored in the document: they are fetched live, so renames show
// everywhere and deleted/inaccessible pages render "หน้านี้ถูกลบแล้ว".
import { createReactBlockSpec } from "@blocknote/react";
import { usePageSummary } from "../lib/stores";
import { thEditor } from "../lib/th-editor";

function SubpageCard(props: { pageId: string; editable: boolean }) {
  const s = usePageSummary(props.pageId);
  const t = thEditor.subpage;
  const label =
    s.status === "ok"
      ? s.title || t.untitled
      : s.status === "deleted"
        ? t.deleted
        : s.status === "creating"
          ? t.creating
          : t.loading;
  const icon = s.status === "ok" ? (s.icon ?? "📄") : "📄";
  return (
    <a
      className={`subpage-card subpage-${s.status}`}
      data-testid="subpage-card"
      href={s.status === "ok" ? `/p/${props.pageId}` : undefined}
      contentEditable={false}
      draggable={false}
      onClick={(e) => {
        // In the app: e.preventDefault(); router.push(`/p/${pageId}`)
        e.preventDefault();
        (window as unknown as { __lastNav?: string }).__lastNav = `/p/${props.pageId}`;
      }}
      aria-disabled={s.status !== "ok"}
    >
      <span aria-hidden>{icon}</span> <span className="subpage-title">{label}</span>
    </a>
  );
}

export const createSubpageBlock = createReactBlockSpec(
  {
    type: "subpage",
    propSchema: {
      pageId: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => (
      <SubpageCard pageId={block.props.pageId} editable={editor.isEditable} />
    ),
    // Used for copy/paste (text/html) & HTML export: a plain link.
    toExternalHTML: ({ block }) => (
      <a href={`/p/${block.props.pageId}`} data-subpage-id={block.props.pageId}>
        /p/{block.props.pageId}
      </a>
    ),
    // Only BlockNote's own internal HTML (data-content-type="subpage") round-trips; see report.
  },
);
