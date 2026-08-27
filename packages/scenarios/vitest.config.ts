import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'scenarios',
    root: '.',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
