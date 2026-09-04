// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'artifacts/**',
      '.pax-data/**',
      'playwright-report/**',
      'test-results/**',
      '.stryker-tmp/**',
      'reports/**',
      // Vendored brand-kit source (docs/brand/**, see its README). Design
      // assets and the kit's own drop-in theme files, kept verbatim so the
      // kit stays re-exportable; nothing here is imported, compiled, or
      // shipped, and `docs/brand/tailwind/sift-theme.ts` is deliberately not
      // in any tsconfig -- which is exactly what the type-checked ruleset
      // errors on ("was not found by the project service"). `.prettierignore`
      // already excludes all of `docs/` for the same reason: this is prose
      // and design source, not code under the repo's formatting/lint gate.
      'docs/brand/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // React 19 will be introduced with apps/web in a later task; the browser
    // globals block is scoped now so lint stays honest about what exists.
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    // Playwright specs/helpers run in Node (the test runner process), but
    // `page.evaluate`/`page.addInitScript` callbacks are function bodies
    // that execute inside the real browser page -- they legitimately
    // reference `document`/`window`/`localStorage`/`getComputedStyle`.
    // Both global sets are added (rather than replacing Node's) since the
    // same file also uses real Node APIs (`node:fs`, `node:path`, ...).
    files: ['tests/e2e/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  eslintConfigPrettier,
);
