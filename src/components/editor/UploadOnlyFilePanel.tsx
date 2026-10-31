'use client'
// src/components/editor/UploadOnlyFilePanel.tsx — the file panel with ONLY the upload tab (r3 §8.2, G8): the stock
// panel's "Embed URL" tab would hot-link external images (§7.6: no external images in the MVP).
import { type FilePanelProps, UploadTab, useComponentsContext, useDictionary } from '@blocknote/react'
import { type JSX, useState } from 'react'

export function UploadOnlyFilePanel(props: FilePanelProps): JSX.Element | null {
  const Components = useComponentsContext()
  const dict = useDictionary()
  const [loading, setLoading] = useState(false)
  if (!Components) return null
  const name = dict.file_panel.upload.title
  return (
    <Components.FilePanel.Root
      className="bn-panel"
      tabs={[{ name, tabPanel: <UploadTab blockId={props.blockId} setLoading={setLoading} /> }]}
      openTab={name}
      setOpenTab={() => {}}
      defaultOpenTab={name}
      loading={loading}
    />
  )
}
