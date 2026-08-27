import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'agent',
    root: '.',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
