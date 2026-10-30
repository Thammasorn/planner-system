import localFont from 'next/font/local'

// IBM Plex Sans Thai, self-hosted (OFL-1.1, see ./OFL.txt). Files copied from @fontsource/ibm-plex-sans-thai@5.3.0
// (M0-D9). next/font/local cannot attach a unicode-range per file, so the Latin and Thai subsets are two families
// composed in one font-family stack (the browser falls back per character). `adjustFontFallback: false` keeps
// system-ui out of the stack before the Thai family (Safari would otherwise pick Thonburi).
export const plexLatin = localFont({
  src: [
    { path: './ibm-plex-sans-thai-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './ibm-plex-sans-thai-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './ibm-plex-sans-thai-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './ibm-plex-sans-thai-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-latin',
  display: 'swap',
  adjustFontFallback: false,
})

export const plexThai = localFont({
  src: [
    { path: './ibm-plex-sans-thai-thai-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './ibm-plex-sans-thai-thai-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './ibm-plex-sans-thai-thai-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './ibm-plex-sans-thai-thai-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-thai',
  display: 'swap',
  adjustFontFallback: false,
  declarations: [
    { prop: 'unicode-range', value: 'U+02D7, U+0303, U+0331, U+0E01-0E5B, U+200C-200D, U+25CC' },
  ],
})
