'use client' // error boundaries must be Client Components
import { th } from '@/i18n/th'

/** Replaces the root layout when it fails (M0-D21): its own document, plain elements, no providers or global CSS. */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="th">
      <body
        style={{ margin: 0, fontFamily: 'system-ui, sans-serif', color: '#1F2937', background: '#FFFFFF' }}
      >
        <title>{th.meta.appName}</title>
        <main style={{ maxWidth: 560, margin: '64px auto', padding: '0 16px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>{th.errors.errorPage.title}</h1>
          <p style={{ color: '#4B5563' }}>{th.errors.errorPage.body}</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              font: 'inherit',
              padding: '6px 16px',
              border: 0,
              borderRadius: 4,
              background: '#2F5597',
              color: '#FFFFFF',
              cursor: 'pointer',
            }}
          >
            {th.common.retry}
          </button>
        </main>
      </body>
    </html>
  )
}
