"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@mui/material";
// `ssr: false` is only allowed inside a Client Component (Next >= 15).
const PageEditor = dynamic(() => import("@/components/editor/PageEditor"), {
  ssr: false,
  loading: () => <Skeleton variant="rectangular" height={240} data-testid="editor-skeleton" />,
});
export function EditorClient(props: { pageId: string; initialContent: unknown[] }) {
  return <PageEditor {...props} />;
}
