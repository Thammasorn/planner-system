'use client' // error boundaries must be Client Components
import { useEffect } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { th } from '@/i18n/th'

/** Thai segment error boundary (M0-D21). The error message itself is never shown (it may be a server digest). */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Box component="section" sx={{ py: 6, px: 2, maxWidth: 560, mx: 'auto', textAlign: 'center' }}>
      <Typography variant="h2" component="h1" gutterBottom>
        {th.errors.errorPage.title}
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 3 }}>{th.errors.errorPage.body}</Typography>
      <Button variant="contained" onClick={() => retry()}>
        {th.common.retry}
      </Button>
    </Box>
  )
}
