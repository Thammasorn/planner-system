import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { AppProviders } from '@/components/providers/AppProviders'
import { th } from '@/i18n/th'
import { NONCE_HEADER } from '@/lib/csp'
import type { ColorScheme } from '@/lib/theme/theme'
import { plexLatin, plexThai } from './fonts/fonts'
import './tokens.css'
import './globals.css'

export const metadata: Metadata = {
  title: { default: th.meta.appName, template: th.meta.titleTemplate },
  description: th.meta.description,
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined // set by src/proxy.ts (x-nonce contract)
  const scheme: ColorScheme = 'light' // M0-D8; M1 reads user_preferences.theme
  return (
    <html
      lang="th"
      className={`${plexLatin.variable} ${plexThai.variable} ${scheme}`}
      suppressHydrationWarning
    >
      <body>
        <AppProviders nonce={nonce} scheme={scheme}>
          {children}
        </AppProviders>
      </body>
    </html>
  )
}
