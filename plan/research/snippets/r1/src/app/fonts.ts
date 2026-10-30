import localFont from 'next/font/local'

// IBM Plex Sans Thai, self-hosted (OFL-1.1). Files copied from @fontsource/ibm-plex-sans-thai@5.3.0/files.
// next/font/local cannot attach a unicode-range per file, so Latin and Thai subsets are two families
// composed in one font-family stack (the browser falls back per character).
export const plexLatin = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-thai-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-thai-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-thai-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/ibm-plex-sans-thai-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-latin',
  display: 'swap',
  adjustFontFallback: false,
})

export const plexThai = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-thai-thai-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-thai-thai-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-thai-thai-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/ibm-plex-sans-thai-thai-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-thai',
  display: 'swap',
  adjustFontFallback: false,
  // Only Thai text needs these files; keep preload for the regular weight via CSS variable use.
  declarations: [{ prop: 'unicode-range', value: 'U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC' }],
})
