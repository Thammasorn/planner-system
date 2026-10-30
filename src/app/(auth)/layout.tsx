import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { th } from '@/i18n/th'

/** Login and account pages: a centred card, no sidebar (M1-D21). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Box
      component="main"
      sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2, py: 4, bgcolor: 'background.default' }}
    >
      <Box sx={{ width: '100%', maxWidth: 440 }}>
        <Typography
          component="p"
          variant="subtitle1"
          sx={{ textAlign: 'center', mb: 2, fontWeight: 600, color: 'var(--brand-navy)' }}
        >
          {th.meta.appName}
        </Typography>
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 } }}>
          {children}
        </Paper>
      </Box>
    </Box>
  )
}
