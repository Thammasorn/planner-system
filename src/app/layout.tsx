import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { AppProviders } from '@/components/providers/AppProviders'
import { th } from '@/i18n/th'
import { NONCE_HEADER } from '@/lib/csp'
import { DEFAULT_PREFERENCES } from '@/lib/schemas/preferences'
import type { ColorScheme } from '@/lib/theme/theme'
import { db } from '@/server/db/client'
import * as services from '@/server/services'
import { getSessionUser } from '@/server/session'
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
  const user = await getSessionUser()
  const prefs = user ? await services.preferences.getPreferences(db, user.id) : DEFAULT_PREFERENCES
  // `system` renders light on the server; MUI resolves it on the client (no localStorage, X05).
  const scheme: ColorScheme = prefs.theme === 'dark' ? 'dark' : 'light'
  return (
    <html
      lang="th"
      className={`${plexLatin.variable} ${plexThai.variable} ${scheme}`}
      suppressHydrationWarning
    >
      <body>
        <AppProviders nonce={nonce} prefs={prefs} signedIn={user !== null}>
          {children}
        </AppProviders>
      </body>
    </html>
  )
}
