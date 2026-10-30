import { EditorClient } from "./EditorClient";
// Server Component: loads the page row (here: stub) and passes JSON to the client-only editor.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const content = [{ type: "heading", props: { level: 2 }, content: "ข้อมูลโปรเจค" }, { type: "paragraph", content: "สวัสดี" }];
  return (
    <main style={{ padding: 24 }}>
      <h1 data-testid="ssr-title">หน้า {id}</h1>
      <EditorClient pageId={id} initialContent={content} />
    </main>
  );
}
