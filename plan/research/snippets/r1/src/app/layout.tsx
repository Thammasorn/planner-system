import type { Metadata, Viewport } from 'next'
import { cookies, headers } from 'next/headers'
import { plexLatin, plexThai } from './fonts'
import { Providers } from './providers'
import { getCounter } from './actions'
import './globals.css'

export const metadata: Metadata = { title: 'exp', description: 'exp' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, interactiveWidget: 'resizes-content' }

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  // Simulates reading user_preferences.theme from the DB for the signed-in user.
  const mode = (await cookies()).get('pref-theme')?.value === 'dark' ? 'dark' : 'light'
  const layoutCounter = await getCounter()
  return (
    <html lang="th" className={`${plexLatin.variable} ${plexThai.variable} ${mode}`} suppressHydrationWarning>
      <body>
        <Providers nonce={nonce} mode={mode}><p data-testid="layout-counter">layout={layoutCounter}</p>{children}</Providers>
      </body>
    </html>
  )
}
