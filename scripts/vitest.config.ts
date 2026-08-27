import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'scripts',
    root: '.',
    environment: 'node',
    include: ['**/*.test.ts'],
    passWithNoTests: true,
  },
});
