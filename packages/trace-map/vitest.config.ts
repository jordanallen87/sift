import { defineConfig } from 'vitest/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    name: 'trace-map',
    root: dirname(fileURLToPath(import.meta.url)),
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
