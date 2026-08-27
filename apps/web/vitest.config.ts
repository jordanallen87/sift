import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'web',
    root: '.',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
