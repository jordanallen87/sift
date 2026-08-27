import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'packs',
    root: '.',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
