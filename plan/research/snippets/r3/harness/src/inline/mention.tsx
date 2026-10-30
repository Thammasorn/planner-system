// Custom inline content: mention chip (FR-529, SPEC §7.7). props: { kind, id }.
// The document stores ids only; names are resolved live (renames propagate, and no
// names of inaccessible pages are ever stored in page JSON).
import { createReactInlineContentSpec } from "@blocknote/react";
import { usePageSummary, useUserName } from "../lib/stores";
import { thEditor } from "../lib/th-editor";

function UserChip({ id }: { id: string }) {
  const name = useUserName(id);
  return (
    <span className="mention mention-user" data-testid="mention-user" data-id={id}>
      @{name ?? (name === null ? thEditor.mention.unknownUser : "…")}
    </span>
  );
}

function PageChip({ id }: { id: string }) {
  const s = usePageSummary(id);
  const label =
    s.status === "ok" ? s.title || thEditor.subpage.untitled : s.status === "deleted" ? thEditor.mention.unknownPage : "…";
  return (
    <a
      className="mention mention-page"
      data-testid="mention-page"
      href={s.status === "ok" ? `/p/${id}` : undefined}
      onClick={(e) => e.preventDefault() /* app: router.push */}
    >
      {s.status === "ok" ? (s.icon ?? "📄") : "📄"} {label}
    </a>
  );
}

export const Mention = createReactInlineContentSpec(
  {
    type: "mention",
    propSchema: {
      kind: { default: "user", values: ["user", "page"] as const },
      id: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) =>
      inlineContent.props.kind === "user" ? (
        <UserChip id={inlineContent.props.id} />
      ) : (
        <PageChip id={inlineContent.props.id} />
      ),
    // Static HTML used for copy/paste & export (no hooks here).
    toExternalHTML: ({ inlineContent }) => (
      <span data-mention-kind={inlineContent.props.kind} data-mention-id={inlineContent.props.id}>
        @{inlineContent.props.id}
      </span>
    ),
  },
);
