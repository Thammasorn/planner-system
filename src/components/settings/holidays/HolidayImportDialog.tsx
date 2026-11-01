'use client'
import { useId, useMemo, useState, type ChangeEvent } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { th } from '@/i18n/th'
import { unwrap } from '@/lib/action-result'
import type { HolidayDTO } from '@/lib/contracts/holidays'
import {
  classifyHolidayRows,
  HOLIDAY_CSV_MAX_BYTES,
  HOLIDAY_CSV_MAX_ROWS,
  holidayCsvErrorMessage,
  parseHolidaysCsv,
  type ClassifiedHolidayRow,
  type HolidayCsvResult,
} from '@/lib/csv/holidays'
import { formatThaiDate } from '@/lib/format'
import { invalidateCalendar, invalidateLoad } from '@/lib/invalidate'
import { importHolidays } from '@/server/actions/holidays'

const BOM = '﻿'

function readBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then((b) => new Uint8Array(b))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsArrayBuffer(file)
  })
}

/** The sample file (M5-D11): built from th (UTF-8 + BOM so Thai Excel opens it correctly), never fetched. */
function downloadSample(): void {
  const t = th.holidays.import
  const url = URL.createObjectURL(new Blob([`${BOM}${t.sampleCsv}\r\n`], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = t.sampleFileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function fileErrorMessage(e: NonNullable<HolidayCsvResult['fileError']>): string {
  const t = th.holidays.import.errors
  switch (e) {
    case 'EMPTY':
      return t.empty
    case 'TOO_MANY':
      return t.tooMany(HOLIDAY_CSV_MAX_ROWS)
    case 'TOO_LARGE':
      return t.tooLarge
  }
}

const EMPTY_RESULT = (fileError: HolidayCsvResult['fileError']): HolidayCsvResult => ({
  encoding: 'utf-8',
  rows: [],
  errors: [],
  fileError,
})

/**
 * Holiday CSV import (FR-901, M5-D11, X64): the browser reads the file (≤ 256 KB) and runs the shared parser
 * (UTF-8 + BOM or windows-874, optional header, RFC 4180 quotes, ISO dates only); the preview marks each row
 * ใหม่ / อัปเดตชื่อ / ไม่เปลี่ยน against the existing holidays. "นำเข้า" is enabled only with zero errors; the
 * server re-validates and upserts all rows in one transaction.
 */
export function HolidayImportDialog({ existing }: { existing: readonly HolidayDTO[] }) {
  const t = th.holidays.import
  const qc = useQueryClient()
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [parsed, setParsed] = useState<{ result: HolidayCsvResult; fileName: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const preview = useMemo<ClassifiedHolidayRow[]>(
    () => (parsed ? classifyHolidayRows(parsed.result.rows, existing) : []),
    [parsed, existing],
  )
  const result = parsed?.result ?? null
  const canImport =
    result !== null && result.fileError === null && result.errors.length === 0 && result.rows.length > 0

  const close = () => {
    if (busy) return
    setOpen(false)
    setParsed(null)
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = '' // the same file can be chosen again after fixing it
    if (!file) return
    if (file.size > HOLIDAY_CSV_MAX_BYTES) {
      setParsed({ result: EMPTY_RESULT('TOO_LARGE'), fileName: file.name })
      return
    }
    try {
      setParsed({ result: parseHolidaysCsv(await readBytes(file)), fileName: file.name })
    } catch {
      setParsed({ result: EMPTY_RESULT('EMPTY'), fileName: file.name })
    }
  }

  const confirm = async () => {
    if (!result || !canImport || busy) return
    setBusy(true)
    try {
      const r = await unwrap(importHolidays({ rows: result.rows.map(({ date, name }) => ({ date, name })) }))
      toast.success(t.done(r.inserted, r.updated))
      setOpen(false)
      setParsed(null)
      void Promise.all([invalidateCalendar(qc), invalidateLoad(qc)])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : th.errors.INTERNAL)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="outlined" startIcon={<UploadFileOutlined />} onClick={() => setOpen(true)}>
        {t.button}
      </Button>
      <Dialog open={open} onClose={close} fullWidth maxWidth="md" aria-labelledby={titleId}>
        <DialogTitle id={titleId}>{t.title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t.hint}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <Button component="label" variant="contained" startIcon={<UploadFileOutlined />}>
                {t.chooseFile}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  aria-label={t.chooseFile}
                  onChange={(e) => void onFile(e)}
                />
              </Button>
              <Button startIcon={<DownloadOutlined />} onClick={downloadSample}>
                {t.sample}
              </Button>
              {parsed ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }} data-testid="import-file-name">
                  {parsed.fileName}
                </Typography>
              ) : null}
            </Stack>

            {result?.fileError ? <Alert severity="error">{fileErrorMessage(result.fileError)}</Alert> : null}

            {result && result.errors.length > 0 ? (
              <Alert severity="error" data-testid="import-errors">
                <AlertTitle>{t.errorsTitle(result.errors.length)}</AlertTitle>
                <Box component="ul" sx={{ m: 0, pl: 3 }}>
                  {result.errors.map((e) => (
                    <li key={`${e.line}:${e.code}`}>{holidayCsvErrorMessage(e)}</li>
                  ))}
                </Box>
              </Alert>
            ) : null}

            {preview.length > 0 ? (
              <Box>
                <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
                  {t.previewTitle(preview.length)}
                </Typography>
                <Table size="small" aria-label={t.previewTitle(preview.length)}>
                  <TableHead>
                    <TableRow>
                      <TableCell>{th.holidays.date}</TableCell>
                      <TableCell>{th.holidays.name}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.map((row) => (
                      <TableRow key={row.date} data-status={row.status}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatThaiDate(row.date)}</TableCell>
                        <TableCell>
                          {row.name}
                          {row.previousName !== undefined ? (
                            <Typography variant="caption" component="div" sx={{ color: 'text.secondary' }}>
                              {t.previousName(row.previousName)}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {/* the status is text (never colour alone) */}
                          <Chip
                            size="small"
                            variant={row.status === 'new' ? 'filled' : 'outlined'}
                            label={t.status[row.status]}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close} disabled={busy}>
            {th.holidays.cancel}
          </Button>
          <Button variant="contained" disabled={!canImport || busy} onClick={() => void confirm()}>
            {t.confirm(result?.rows.length ?? 0)}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
