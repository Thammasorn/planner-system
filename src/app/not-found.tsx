import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Link from '@/components/Link'
import { th } from '@/i18n/th'

export const metadata: Metadata = { title: th.errors.notFoundPage.title }

/** Thai 404 (X41, M0-D21). */
export default function NotFound() {
  return (
    <Box component="main" sx={{ py: 8, px: 2, maxWidth: 560, mx: 'auto', textAlign: 'center' }}>
      <Typography variant="h5" component="h1" gutterBottom>
        {th.errors.notFoundPage.title}
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 3 }}>{th.errors.notFoundPage.body}</Typography>
      <Button variant="contained" component={Link} href="/home">
        {th.common.backToHome}
      </Button>
    </Box>
  )
}
