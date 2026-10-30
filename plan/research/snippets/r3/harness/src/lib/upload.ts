// Client-side upload helpers. The server (/api/files) re-validates with magic bytes
// (file-type) and is the authority; this is only for instant feedback + block routing.
import type { AppEditor, AppPartialBlock } from "../schema"; // type-only: no runtime cycle with schema.ts
import { thEditor } from "./th-editor";

export const IMAGE_MIME = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
const ATTACHMENT_EXT = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "zip", "svg"] as const;
export const MAX_IMAGE = 10 * 1024 * 1024;
export const MAX_ATTACHMENT = 25 * 1024 * 1024;

export type FileClass = { kind: "IMAGE" | "ATTACHMENT" } | { error: string };

export function classifyFile(f: { name: string; type: string; size: number }): FileClass {
  if ((IMAGE_MIME as readonly string[]).includes(f.type)) {
    return f.size <= MAX_IMAGE ? { kind: "IMAGE" } : { error: thEditor.upload.tooLargeImage };
  }
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if ((ATTACHMENT_EXT as readonly string[]).includes(ext)) {
    return f.size <= MAX_ATTACHMENT ? { kind: "ATTACHMENT" } : { error: thEditor.upload.tooLargeFile };
  }
  return { error: thEditor.upload.typeNotAllowed };
}

export type UploadResponse = {
  id: string;
  url: string; // relative: /api/files/<id>
  name: string;
  size: number;
  kind: "IMAGE" | "ATTACHMENT";
};

export type Notify = (msg: string) => void;

/** Upload-in-progress store keyed by blockId, read with useSyncExternalStore.
 *  WHY: BlockNote's `useUploadLoading` subscribes in a useEffect, so a React custom block that
 *  mounts in the same tick as `uploadFile()` starts MISSES the start event (verified: loader never
 *  shows). A store read during render has no such race. */
const uploading = new Set<string>();
const uploadListeners = new Set<() => void>();
export const uploadStore = {
  subscribe(l: () => void) {
    uploadListeners.add(l);
    return () => uploadListeners.delete(l);
  },
  has: (id: string) => uploading.has(id),
  set(id: string | undefined, on: boolean) {
    if (!id) return;
    if (on) uploading.add(id);
    else uploading.delete(id);
    uploadListeners.forEach((l) => l());
  },
};

/** BlockNote `uploadFile` option. Returns a *PartialBlock* (not flat props!):
 *  BlockNote does `editor.updateBlock(blockId, returnValue)` for object results.
 *  NEVER rejects: BlockNote's drop path (`void handleFileInsertion(...)`) does not catch,
 *  so a rejection becomes an unhandled promise rejection (Next dev overlay). On failure we
 *  toast, resolve `{}` (BlockNote's follow-up updateBlock(id, {}) is a no-op) and then remove
 *  the *empty placeholder* block on the next tick (never a block that already has a url,
 *  e.g. "replace image"). */
export function makeUploadFile(opts: { pageId: string; notify: Notify; getEditor: () => AppEditor | null }) {
  const fail = (msg: string, blockId?: string): Record<string, never> => {
    opts.notify(msg);
    setTimeout(() => {
      const editor = opts.getEditor();
      const b = editor && blockId ? editor.getBlock(blockId) : undefined;
      if (editor && b && (b.props as { url?: string }).url === "") editor.removeBlocks([b.id]);
    }, 0);
    return {};
  };
  return async (file: File, blockId?: string): Promise<string | Record<string, unknown>> => {
    uploadStore.set(blockId, true);
    try {
      return await doUpload(file, blockId);
    } finally {
      uploadStore.set(blockId, false);
    }
  };
  async function doUpload(file: File, blockId?: string): Promise<string | Record<string, unknown>> {
    const cls = classifyFile(file);
    if ("error" in cls) return fail(cls.error, blockId);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("pageId", opts.pageId);
    let res: Response;
    try {
      res = await fetch("/api/files", { method: "POST", body: fd });
    } catch {
      return fail(thEditor.upload.failed, blockId);
    }
    if (!res.ok) return fail(thEditor.upload.failed, blockId);
    const r = (await res.json()) as UploadResponse;
    // Server decides the kind (magic bytes). Switch block type if needed (e.g. SVG, fake .png).
    if (r.kind === "IMAGE") return { type: "image", props: { url: r.url, name: r.name } };
    return { type: "file", props: { url: r.url, name: r.name, size: r.size } };
  }
}

/** Our own file insertion for paste (so we control SVG routing, limits and ordering).
 *  Mirrors BlockNote's internal insertOrUpdateBlock behaviour. */
export async function insertFilesAtCursor(
  editor: AppEditor,
  files: File[],
  notify: Notify,
): Promise<void> {
  let ref = editor.getTextCursorPosition().block;
  for (const file of files) {
    const cls = classifyFile(file);
    if ("error" in cls) {
      notify(cls.error);
      continue;
    }
    const placeholder: AppPartialBlock =
      cls.kind === "IMAGE" ? { type: "image", props: { name: file.name } } : { type: "file", props: { name: file.name } };
    const isEmptyTextBlock = Array.isArray(ref.content) && ref.content.length === 0;
    const inserted = isEmptyTextBlock
      ? editor.updateBlock(ref, placeholder)
      : editor.insertBlocks([placeholder], ref, "after")[0]!;
    ref = inserted;
    if (!editor.uploadFile) return;
    const data = await editor.uploadFile(file, inserted.id); // never rejects (see makeUploadFile)
    if (!editor.getBlock(inserted.id)) continue; // user deleted it meanwhile / failure cleanup
    editor.updateBlock(inserted.id, typeof data === "string" ? { props: { url: data } } : (data as AppPartialBlock));
  }
}
