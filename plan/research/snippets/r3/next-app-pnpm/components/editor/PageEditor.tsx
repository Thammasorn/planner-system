"use client";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useColorScheme } from "@mui/material/styles";
import { Button, Stack } from "@mui/material";
import { useEffect, useState } from "react";

export default function PageEditor({ pageId, initialContent }: { pageId: string; initialContent: unknown[] }) {
  const editor = useCreateBlockNote({ initialContent: initialContent.length ? (initialContent as never) : undefined }, [pageId]);
  const { mode, setMode } = useColorScheme();
  const [editable, setEditable] = useState(true);
  useEffect(() => { (window as unknown as { __bn: unknown }).__bn = editor; }, [editor]);
  const scheme = mode === "dark" ? "dark" : "light";
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={() => setMode(scheme === "dark" ? "light" : "dark")} data-testid="toggle-mode">โหมด</Button>
        <Button variant="outlined" onClick={() => setEditable((e) => !e)} data-testid="toggle-edit">แก้/อ่าน</Button>
      </Stack>
      <BlockNoteView editor={editor} theme={scheme} editable={editable} />
    </Stack>
  );
}
