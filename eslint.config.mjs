// eslint.config.mjs — Team Working OS
// Verified 2026-09-30 with: eslint 10.11.0, typescript-eslint 8.71.0 (+ typescript 6.0.3), eslint-config-next 16.3.7,
// eslint-plugin-react-hooks 7.1.1 (bundled by eslint-config-next), @eslint-community/eslint-plugin-eslint-comments 4.8.1,
// eslint-config-prettier 10.1.8. Also runs unchanged on eslint 9.39.5.
// Pinned to ESLint 9.39 (M0-D1); the react version pin is kept so an ESLint 10 upgrade needs no config change.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import tseslint from 'typescript-eslint'
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs'
import prettier from 'eslint-config-prettier/flat'

// ---------------------------------------------------------------------------
// Shared selector sets for `no-restricted-syntax`.
// NOTE: a later config object that sets `no-restricted-syntax` REPLACES (does not merge) earlier
// options for the files it matches, so every block below repeats the sets it needs.
// ---------------------------------------------------------------------------
// Thai block U+0E00–U+0E7F. The "\\u" is a literal backslash-u inside the selector string;
// esquery turns /[฀-๿]/ into a RegExp. Regex *literals* (e.g. /[ก-๙]/u) are not flagged
// because esquery only tests string values; comments are never flagged.
const THAI = '[\\u0E00-\\u0E7F]'
const THAI_MSG = 'UI text (Thai) must live in src/i18n/th.ts (CLAUDE.md > UX). Import it from there.'
const NO_THAI = [
  { selector: `Literal[value=/${THAI}/]`, message: THAI_MSG }, // '...' "..." JSX attribute strings, TS literal types
  { selector: `TemplateElement[value.raw=/${THAI}/]`, message: THAI_MSG }, // `...${x}...`
  { selector: `JSXText[value=/${THAI}/]`, message: THAI_MSG }, // <p>...</p>
]
const DATE_MSG =
  'src/domain must not use JS Date; use the ISODate helpers in src/domain/dates.ts (CLAUDE.md > dates).'
const NO_DATE = [
  { selector: "NewExpression[callee.name='Date']", message: DATE_MSG }, // new Date(...)
  { selector: "NewExpression[callee.property.name='Date']", message: DATE_MSG }, // new globalThis.Date()
  { selector: "CallExpression[callee.name='Date']", message: DATE_MSG }, // Date()
  { selector: "MemberExpression[object.name='Date'][property.name=/^(now|parse|UTC)$/]", message: DATE_MSG },
]

// Where Thai text is legitimate.
const THAI_ALLOWED = ['src/i18n/**', 'scripts/**', 'tests/**', 'e2e/**', '**/*.test.*', '**/*.spec.*']

export default defineConfig([
  // 1) Next.js presets: react, react-hooks v7 (incl. React-Compiler-based rules), jsx-a11y, import, @next/next,
  //    and typescript-eslint "recommended" for TS files.
  ...nextVitals,
  ...nextTs,

  // ESLint 10 removed context.getFilename(); eslint-plugin-react 7.37.5 still calls it when
  // settings.react.version === 'detect' (the eslint-config-next default) and crashes. Pin the version.
  // Keep in sync with package.json "react".
  { settings: { react: { version: '19.3' } } },

  // 2) Type-aware rules for TS/TSX only.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 10,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Async handlers (server actions, mutations) are passed to onClick/onSubmit props.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      // Catch deprecated library APIs early (TanStack isServer/fetchQuery/prefetchQuery, zod string formats, MUI props...).
      '@typescript-eslint/no-deprecated': 'error',
    },
  },

  // 2b) Test files: mocks and matchers trip a few type-aware rules.
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off', // expect(obj.method).toHaveBeenCalled()
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/require-await': 'off', // vi.fn(async () => ...) mock factories
    },
  },

  // 3) Every eslint-disable must say why:  // eslint-disable-next-line rule-name -- reason
  comments.recommended,
  {
    rules: {
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: ['eslint-enable'] }],
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
    },
  },
  { linterOptions: { reportUnusedDisableDirectives: 'error', reportUnusedInlineConfigs: 'error' } },

  // 4) React-Compiler advisory: we do not enable the React Compiler, and TanStack Virtual's
  //    useVirtualizer() is flagged as an "incompatible library" (warning) wherever it is used.
  { rules: { 'react-hooks/incompatible-library': 'off' } },

  // 5a) No Thai text outside i18n / scripts / tests.
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'],
    ignores: THAI_ALLOWED,
    rules: { 'no-restricted-syntax': ['error', ...NO_THAI] },
  },

  // 5b) src/domain: Thai ban + no JS Date (except dates.ts, which owns todayBangkok()).
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    ignores: ['src/domain/dates.ts', ...THAI_ALLOWED],
    rules: { 'no-restricted-syntax': ['error', ...NO_THAI, ...NO_DATE] },
  },

  // 5c) src/domain purity: no React / Next / DB / server / UI imports, no IO.
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'src/domain is pure TS: no React.' },
            { name: 'react-dom', message: 'src/domain is pure TS: no React.' },
            { name: 'next', message: 'src/domain is pure TS: no Next.js.' },
            { name: 'drizzle-orm', message: 'src/domain is pure TS: no DB access.' },
            { name: 'postgres', message: 'src/domain is pure TS: no DB access.' },
          ],
          patterns: [
            { regex: '^(react|react-dom|next|drizzle-orm|drizzle-kit)/', message: 'src/domain is pure TS.' },
            {
              regex: '^@/(server|app|components|hooks)(/|$)',
              message: 'src/domain must not import server/UI layers.',
            },
            {
              regex: '^(\\.\\./)+(server|app|components|hooks)(/|$)',
              message: 'src/domain must not import server/UI layers.',
            },
            {
              regex: '^(node:)?(fs|fs/promises|child_process|net|http|https|worker_threads)$',
              message: 'src/domain must not do IO.',
            },
          ],
        },
      ],
    },
  },

  // 5d) No browser storage for data (CLAUDE.md > Dependencies and runtime; preferences live in user_preferences).
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message: 'Use user_preferences (server) instead of localStorage (CLAUDE.md).',
        },
        {
          name: 'sessionStorage',
          message: 'Use user_preferences (server) instead of sessionStorage (CLAUDE.md).',
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: 'No localStorage (CLAUDE.md).' },
        { object: 'window', property: 'sessionStorage', message: 'No sessionStorage (CLAUDE.md).' },
      ],
    },
  },

  // 6) Turn off stylistic rules that fight Prettier (keep after all rule blocks).
  prettier,

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'drizzle/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'blob-report/**',
    'e2e/.auth/**',
    'uploads/**',
    'backups/**',
    '.e2e-uploads/**',
    'plan/**',
    'docs/**',
    '.claude/**',
    'affine/**', // owner's local AFFiNE trial (PLAN.md §1.7); its data/ holds a live Postgres cluster
  ]),
])
