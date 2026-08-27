import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'contracts',
    root: '.',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
